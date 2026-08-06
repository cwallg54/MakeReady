"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { headers } from "next/headers";
import { db } from "@/db";
import { customerDocuments, activities } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView, canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { consumeRateLimit, clientIp, retryMessage } from "@/lib/security/rate-limit";
import { DOC_LABELS } from "./meta";

async function requireCrmEdit() {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "crm")) redirect("/403");
  if (!canEdit(user.roles, "crm")) redirect("/403");
  return user;
}

/** Staff: create a pending document request for a customer (returns a token link). */
export async function createDocumentRequestAction(formData: FormData): Promise<void> {
  const user = await requireCrmEdit();
  const bpId = String(formData.get("bpId") ?? "");
  const docType = String(formData.get("docType") ?? "");
  if (!bpId || !["terms_application", "credit_card_application"].includes(docType)) return;
  const dt = docType as "terms_application" | "credit_card_application";
  const orderId = String(formData.get("orderId") ?? "") || null;
  const token = randomBytes(18).toString("hex");
  await db.insert(customerDocuments).values({ bpId, orderId, docType: dt, token, requestedBy: user.id });
  await db.insert(activities).values({ bpId, userId: user.id, type: "other", isSystem: true, content: `Requested ${DOC_LABELS[dt]} from customer` });
  await audit({ userId: user.id, action: "document.request", entityType: "business_partner", entityId: bpId, metadata: { docType, orderId } });
  revalidatePath(`/crm/${bpId}`);
}

export interface DocState {
  error?: string;
  ok?: boolean;
}

/** Public: customer submits a completed document via their token link. */
export async function submitDocumentAction(_prev: DocState, formData: FormData): Promise<DocState> {
  const rl = await consumeRateLimit("doc-submit", await clientIp(), 20, 3600);
  if (!rl.ok) return { error: `Too many attempts. ${retryMessage(rl.retryAfterSec)}` };
  const token = String(formData.get("token") ?? "");
  const doc = await db.query.customerDocuments.findFirst({ where: eq(customerDocuments.token, token) });
  if (!doc) return { error: "This link is not valid." };
  if (doc.status === "completed") return { ok: true };

  const signedName = String(formData.get("signedName") ?? "").trim();
  const agree = formData.get("agree") === "on";
  if (!signedName || !agree) return { error: "Please complete the signature and agree to the terms." };

  // Build the stored data from real fields only — skip React's Server-Action
  // internals ($ACTION_*) and control fields.
  const entries: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (k === "token" || k === "agree" || k.startsWith("$ACTION")) continue;
    if (typeof v === "string" && v.trim()) entries[k] = v;
  }

  // Validate email fields server-side (browsers only check the ones they render).
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (const [k, v] of Object.entries(entries)) {
    if (/email/i.test(k) && !emailRe.test(v.trim())) {
      return { error: `Please enter a valid email address for “${k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}”.` };
    }
  }

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  await db
    .update(customerDocuments)
    .set({ data: entries, signedName, status: "completed", submittedAt: new Date(), ip })
    .where(eq(customerDocuments.id, doc.id));
  await db.insert(activities).values({
    bpId: doc.bpId,
    type: "other",
    isSystem: true,
    content: `Customer completed ${DOC_LABELS[doc.docType]} (signed: ${signedName})`,
  });
  await audit({ action: "document.submitted", entityType: "business_partner", entityId: doc.bpId, metadata: { docType: doc.docType } });
  revalidatePath(`/crm/${doc.bpId}`);
  return { ok: true };
}

/** Create a request during BP creation (called from the CRM create flow). */
export async function requestDocumentForBp(bpId: string, docType: "terms_application" | "credit_card_application", userId: string): Promise<void> {
  const token = randomBytes(18).toString("hex");
  await db.insert(customerDocuments).values({ bpId, docType, token, requestedBy: userId });
  await db.insert(activities).values({ bpId, userId, type: "other", isSystem: true, content: `Requested ${DOC_LABELS[docType]} from customer` });
}
