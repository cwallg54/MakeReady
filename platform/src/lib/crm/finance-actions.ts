"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { customerAttachments, businessPartners, contacts, activities } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView, canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { sendCustomerWelcomeEmail } from "@/lib/email";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const KINDS = ["experian", "tax_exempt", "credit_app", "address_change", "credit_increase", "other"] as const;

/** The customer document vault is Finance/Admin only — never Sales or Art. */
async function requireFinance() {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "accounting") || !canEdit(user.roles, "accounting")) redirect("/403");
  return user;
}

export async function uploadCustomerAttachmentAction(formData: FormData): Promise<void> {
  const user = await requireFinance();
  const bpId = String(formData.get("bpId") ?? "");
  if (!bpId) return;
  const kindRaw = String(formData.get("kind") ?? "other");
  const kind = (KINDS as readonly string[]).includes(kindRaw) ? (kindRaw as (typeof KINDS)[number]) : "other";
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);

  let saved = 0;
  for (const file of files) {
    if (file.size > MAX_BYTES) continue;
    const buf = Buffer.from(await file.arrayBuffer());
    await db.insert(customerAttachments).values({
      bpId,
      kind,
      filename: file.name.slice(0, 200),
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      contentBase64: buf.toString("base64"),
      notes,
      uploadedBy: user.id,
    });
    saved++;
  }
  await audit({ userId: user.id, action: "customer.attach", entityType: "business_partner", entityId: bpId, metadata: { kind, saved } });
  revalidatePath(`/crm/${bpId}`);
}

export async function deleteCustomerAttachmentAction(formData: FormData): Promise<void> {
  const user = await requireFinance();
  const bpId = String(formData.get("bpId") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!bpId || !id) return;
  await db.delete(customerAttachments).where(and(eq(customerAttachments.id, id), eq(customerAttachments.bpId, bpId)));
  await audit({ userId: user.id, action: "customer.attach_delete", entityType: "business_partner", entityId: bpId });
  revalidatePath(`/crm/${bpId}`);
}

/** Send the customer a welcome / account-approved email (Finance/Admin). */
export async function sendWelcomeEmailAction(formData: FormData): Promise<void> {
  const user = await requireFinance();
  const bpId = String(formData.get("bpId") ?? "");
  if (!bpId) return;
  const bp = await db.query.businessPartners.findFirst({ where: eq(businessPartners.id, bpId) });
  if (!bp) return;
  const contact = await db.query.contacts.findFirst({ where: and(eq(contacts.bpId, bpId), eq(contacts.isPrimary, true)), columns: { email: true } });
  const to = contact?.email ?? bp.email ?? "";
  const site = process.env.CUSTOMER_SITE_URL ?? "https://g54.com";
  if (to) await sendCustomerWelcomeEmail(to, bp.companyName, site);
  await db.insert(activities).values({ bpId, userId: user.id, type: "email", isSystem: true, content: `Welcome / account-approved email sent to ${to || "customer (no email on file)"}` });
  await audit({ userId: user.id, action: "customer.welcome_email", entityType: "business_partner", entityId: bpId, metadata: { to } });
  revalidatePath(`/crm/${bpId}`);
}
