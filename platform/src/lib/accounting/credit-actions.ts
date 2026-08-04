"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { creditApprovalRequests, businessPartners, quotes, notifications, activities } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView, canEdit, isAdmin } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { createOrderFromQuote } from "@/lib/sales/order-from-quote";
import { creditApprovalThreshold } from "@/lib/sales/credit";

async function requireAccountingEdit() {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "accounting") || !canEdit(user.roles, "accounting")) redirect("/403");
  return user;
}
const num = (v: FormDataEntryValue | null) => { const n = Number(String(v ?? "").trim()); return Number.isFinite(n) ? n : 0; };

export async function approveCreditRequestAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const req = await db.query.creditApprovalRequests.findFirst({ where: eq(creditApprovalRequests.id, id) });
  if (!req || req.status !== "pending") return;

  // Tier gate: finance may clear up to the threshold over-limit; more needs an admin.
  const threshold = await creditApprovalThreshold();
  if (req.reason === "over_limit" && Number(req.amountOver) > threshold && !isAdmin(user.roles)) {
    redirect("/accounting/credit-requests?err=tier");
  }

  const newLimitStr = String(formData.get("newLimit") ?? "").trim();
  const clearHold = formData.get("clearHold") === "on";
  const note = String(formData.get("note") ?? "").trim() || null;

  if (req.bpId) {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (newLimitStr) set.creditLimit = String(num(formData.get("newLimit")).toFixed(2));
    if (clearHold) { set.creditHold = false; set.creditHoldReason = null; }
    if (Object.keys(set).length > 1) await db.update(businessPartners).set(set).where(eq(businessPartners.id, req.bpId));
  }

  // Convert the quote to an order now that finance has signed off.
  if (req.quoteId) {
    await createOrderFromQuote(req.quoteId, req.requestedBy);
    await db.update(quotes).set({ status: "converted", updatedAt: new Date() }).where(eq(quotes.id, req.quoteId));
  }
  await db.update(creditApprovalRequests).set({ status: "approved", decidedBy: user.id, decidedAt: new Date(), decisionNote: note, newLimit: newLimitStr ? String(num(formData.get("newLimit")).toFixed(2)) : null }).where(eq(creditApprovalRequests.id, id));

  if (req.requestedBy) {
    await db.insert(notifications).values({ userId: req.requestedBy, type: "task", title: "Credit approved", body: `Finance approved the order — it's now in production.${note ? ` “${note}”` : ""}`, link: req.quoteId ? `/sales/quotes/${req.quoteId}` : "/sales" });
  }
  if (req.bpId) await db.insert(activities).values({ bpId: req.bpId, userId: user.id, type: "other", isSystem: true, content: `Finance approved credit review — order created${newLimitStr ? `, credit limit set to $${num(formData.get("newLimit")).toFixed(0)}` : ""}${clearHold ? ", hold cleared" : ""}` });
  await audit({ userId: user.id, action: "credit.approve", entityType: "credit_request", entityId: id });
  revalidatePath("/accounting/credit-requests");
  revalidatePath("/accounting");
}

export async function denyCreditRequestAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!id) return;
  const req = await db.query.creditApprovalRequests.findFirst({ where: eq(creditApprovalRequests.id, id) });
  if (!req || req.status !== "pending") return;
  await db.update(creditApprovalRequests).set({ status: "denied", decidedBy: user.id, decidedAt: new Date(), decisionNote: note }).where(eq(creditApprovalRequests.id, id));
  if (req.requestedBy) {
    await db.insert(notifications).values({ userId: req.requestedBy, type: "task", title: "Credit review declined", body: `Finance declined the credit review for this order.${note ? ` “${note}”` : ""}`, link: req.quoteId ? `/sales/quotes/${req.quoteId}` : "/sales" });
  }
  if (req.bpId) await db.insert(activities).values({ bpId: req.bpId, userId: user.id, type: "note", isSystem: true, content: `Finance declined credit review${note ? ` — ${note}` : ""}` });
  await audit({ userId: user.id, action: "credit.deny", entityType: "credit_request", entityId: id });
  revalidatePath("/accounting/credit-requests");
}
