"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { vendors, bills, billLines, billPayments, numberSeries } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView, canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { recomputeBillTotals, refreshBill } from "./ap";
import { postBillToGl, postBillPaymentToGl, reverseGlForSource } from "./gl-post";

async function requireAccountingEdit() {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "accounting") || !canEdit(user.roles, "accounting")) redirect("/403");
  return user;
}
const str = (v: FormDataEntryValue | null) => { const s = String(v ?? "").trim(); return s || null; };
const num = (v: FormDataEntryValue | null) => { const n = Number(String(v ?? "").trim()); return Number.isFinite(n) ? n : 0; };
const termsDays = (t: string | null | undefined) => { const m = /(\d+)/.exec(t ?? ""); return m ? Number(m[1]) : 30; };

async function nextBillNumber(): Promise<string> {
  return db.transaction(async (tx) => {
    let s = await tx.query.numberSeries.findFirst({ where: eq(numberSeries.documentType, "bill") });
    if (!s) [s] = await tx.insert(numberSeries).values({ documentType: "bill", prefix: "BILL-", nextNumber: 1, padding: 5 }).returning();
    const n = s.nextNumber;
    await tx.update(numberSeries).set({ nextNumber: n + 1, updatedAt: new Date() }).where(eq(numberSeries.id, s.id));
    return `${s.prefix}${String(n).padStart(s.padding, "0")}`;
  });
}

// ---- Vendors --------------------------------------------------------------

export async function createVendorAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const name = str(formData.get("name"));
  if (!name) return;
  await db.insert(vendors).values({
    name, email: str(formData.get("email")), phone: str(formData.get("phone")),
    terms: str(formData.get("terms")), defaultAccountId: str(formData.get("defaultAccountId")),
    address: str(formData.get("address")), notes: str(formData.get("notes")), createdBy: user.id,
  });
  await audit({ userId: user.id, action: "vendor.create", entityType: "vendor", entityId: name });
  revalidatePath("/accounting/vendors");
}

export async function toggleVendorAction(formData: FormData): Promise<void> {
  await requireAccountingEdit();
  const id = str(formData.get("id"));
  if (!id) return;
  const v = await db.query.vendors.findFirst({ where: eq(vendors.id, id), columns: { active: true } });
  if (!v) return;
  await db.update(vendors).set({ active: !v.active, updatedAt: new Date() }).where(eq(vendors.id, id));
  revalidatePath("/accounting/vendors");
}

// ---- Bills ----------------------------------------------------------------

export async function createBillAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const vendorId = str(formData.get("vendorId"));
  const vendor = vendorId ? await db.query.vendors.findFirst({ where: eq(vendors.id, vendorId) }) : null;
  const billNumber = await nextBillNumber();
  const [bill] = await db.insert(bills).values({
    billNumber, vendorId, vendorRef: str(formData.get("vendorRef")),
    terms: vendor?.terms ?? "Net 30", createdBy: user.id,
  }).returning({ id: bills.id });
  await audit({ userId: user.id, action: "bill.create", entityType: "bill", entityId: bill.id });
  redirect(`/accounting/bills/${bill.id}`);
}

export async function updateBillMetaAction(formData: FormData): Promise<void> {
  await requireAccountingEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const dueStr = String(formData.get("dueDate") ?? "").trim();
  await db.update(bills).set({
    vendorId: str(formData.get("vendorId")),
    vendorRef: str(formData.get("vendorRef")),
    terms: str(formData.get("terms")),
    dueDate: dueStr ? new Date(dueStr + "T12:00:00") : null,
    notes: str(formData.get("notes")),
    updatedAt: new Date(),
  }).where(eq(bills.id, id));
  revalidatePath(`/accounting/bills/${id}`);
}

export async function addBillLineAction(formData: FormData): Promise<void> {
  await requireAccountingEdit();
  const billId = String(formData.get("billId") ?? "");
  if (!billId) return;
  const qty = num(formData.get("qty")) || 1;
  const unitPrice = num(formData.get("unitPrice"));
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(billLines).where(eq(billLines.billId, billId));
  await db.insert(billLines).values({
    billId, accountId: str(formData.get("accountId")),
    description: str(formData.get("description")) ?? "(item)",
    qty: qty.toFixed(2), unitPrice: unitPrice.toFixed(2), extended: (qty * unitPrice).toFixed(2), sortOrder: n,
  });
  await recomputeBillTotals(billId);
  await refreshBill(billId);
  revalidatePath(`/accounting/bills/${billId}`);
}

export async function removeBillLineAction(formData: FormData): Promise<void> {
  await requireAccountingEdit();
  const billId = String(formData.get("billId") ?? "");
  const lineId = String(formData.get("lineId") ?? "");
  if (!billId || !lineId) return;
  await db.delete(billLines).where(and(eq(billLines.id, lineId), eq(billLines.billId, billId)));
  await recomputeBillTotals(billId);
  await refreshBill(billId);
  revalidatePath(`/accounting/bills/${billId}`);
}

/** Approve (issue) a draft bill: set dates, open it, and post it to the GL. */
export async function approveBillAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const bill = await db.query.bills.findFirst({ where: eq(bills.id, id) });
  if (!bill || bill.voidedAt || bill.status !== "draft") return;
  if (Number(bill.total) <= 0) redirect(`/accounting/bills/${id}?err=${encodeURIComponent("Add at least one line before approving.")}`);
  const issue = bill.issueDate ?? new Date();
  const due = bill.dueDate ?? new Date(issue.getTime() + termsDays(bill.terms) * 86_400_000);
  await db.update(bills).set({ status: "open", issueDate: issue, dueDate: due, updatedAt: new Date() }).where(eq(bills.id, id));
  await postBillToGl(id, user.id); // Dr expense / Cr AP
  await audit({ userId: user.id, action: "bill.approve", entityType: "bill", entityId: id });
  revalidatePath(`/accounting/bills/${id}`);
  revalidatePath("/accounting/bills");
}

export async function recordBillPaymentAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const billId = str(formData.get("billId"));
  const amount = num(formData.get("amount"));
  if (!billId || amount <= 0) return;
  const bill = await db.query.bills.findFirst({ where: eq(bills.id, billId) });
  if (!bill || bill.voidedAt || bill.status === "draft") return;
  const method = String(formData.get("method") ?? "check");
  const dateStr = String(formData.get("paidDate") ?? "").trim();
  const [pay] = await db.insert(billPayments).values({
    billId, vendorId: bill.vendorId, amount: amount.toFixed(2),
    method: (["check", "ach", "card", "cash", "credit", "other"].includes(method) ? method : "check") as "check" | "ach" | "card" | "cash" | "credit" | "other",
    reference: str(formData.get("reference")),
    paidDate: dateStr ? new Date(dateStr + "T12:00:00") : new Date(),
    notes: str(formData.get("notes")), createdBy: user.id,
  }).returning({ id: billPayments.id });
  await postBillPaymentToGl(pay.id, user.id); // Dr AP / Cr Cash
  await refreshBill(billId);
  await audit({ userId: user.id, action: "bill.payment", entityType: "bill", entityId: billId, metadata: { amount } });
  revalidatePath(`/accounting/bills/${billId}`);
  revalidatePath("/accounting/bills");
}

export async function voidBillAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!id) return;
  const bill = await db.query.bills.findFirst({ where: eq(bills.id, id) });
  if (!bill || bill.voidedAt) return;
  await db.update(bills).set({ voidedAt: new Date(), voidReason: reason || "Voided", status: "void", updatedAt: new Date() }).where(eq(bills.id, id));
  await reverseGlForSource("bill", id, user.id, `Bill ${bill.billNumber} voided`);
  await audit({ userId: user.id, action: "bill.void", entityType: "bill", entityId: id, metadata: { reason } });
  revalidatePath(`/accounting/bills/${id}`);
  revalidatePath("/accounting/bills");
}
