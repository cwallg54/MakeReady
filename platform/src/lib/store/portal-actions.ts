"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { storeCustomers, businessPartners } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { createCustomerInvite } from "./customer-auth";
import { sendWelcomeEmail } from "@/lib/email";

/**
 * Staff invites a business partner's contact to the customer portal. Finds or
 * creates a store customer linked to the BP, then emails a one-time
 * set-password link. Invite-based (we never set the customer's password).
 */
export async function invitePortalCustomerAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !canEdit(user.roles, "crm")) redirect("/403");
  const bpId = String(formData.get("bpId") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  if (!bpId || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    redirect(`/crm/${bpId}?portal=bademail`);
  }
  const bp = await db.query.businessPartners.findFirst({ where: eq(businessPartners.id, bpId), columns: { id: true, companyName: true } });
  if (!bp) return;

  let customer = await db.query.storeCustomers.findFirst({ where: eq(storeCustomers.email, email) });
  if (!customer) {
    [customer] = await db.insert(storeCustomers).values({
      email, name: name || email, companyName: bp.companyName, bpId: bp.id, status: "pending",
    }).returning();
  } else if (!customer.bpId) {
    await db.update(storeCustomers).set({ bpId: bp.id, updatedAt: new Date() }).where(eq(storeCustomers.id, customer.id));
  }

  const token = await createCustomerInvite(customer.id);
  const base = process.env.APP_URL ?? "https://makeready.g54.com";
  await sendWelcomeEmail(email, name || bp.companyName || "there", `${base}/shop/set-password?token=${token}`, `${base}/shop/login`);
  await audit({ userId: user.id, action: "portal.invite", entityType: "business_partner", entityId: bpId, metadata: { email } });
  revalidatePath(`/crm/${bpId}`);
  redirect(`/crm/${bpId}?portal=invited`);
}
