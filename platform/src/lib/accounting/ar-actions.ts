"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { creditMemos, creditMemoLines, invoices, numberSeries, payments } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canEdit, canView } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { applyCreditMemo, applyPayment, openInvoicesFor, allocateOldestFirst, recomputeAccountBalanceFromApplications, refreshInvoiceFromApplications, type ApplyLine } from "./ar-apply";
import { createDeposit, voidDeposit } from "./deposits";
import { postCreditMemoToGl, reverseGlForSource } from "./gl-post";

async function requireAccountingEdit() {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "accounting") || !canEdit(user.roles, "accounting")) redirect("/403");
  return user;
}

const str = (v: FormDataEntryValue | null): string | null => {
  const s = String(v ?? "").trim();
  return s || null;
};
const num = (v: FormDataEntryValue | null): number => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Read `apply[<invoiceId>]` fields off the form into application lines. */
function applyLines(formData: FormData): ApplyLine[] {
  const out: ApplyLine[] = [];
  for (const [key, value] of formData.entries()) {
    const m = /^apply\[(.+)\]$/.exec(key);
    if (!m) continue;
    const amount = Number(String(value).trim());
    if (Number.isFinite(amount) && amount > 0) out.push({ invoiceId: m[1], amount: round2(amount) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cash application
// ---------------------------------------------------------------------------

/** Apply a receipt across the invoices ticked on the apply screen. */
export async function applyPaymentAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const paymentId = String(formData.get("paymentId") ?? "");
  if (!paymentId) return;

  const res = await applyPayment(paymentId, applyLines(formData), user.id);
  await audit({
    userId: user.id,
    action: "ar.payment_apply",
    entityType: "payment",
    entityId: paymentId,
    metadata: res.ok ? { applied: res.applied, unapplied: res.unapplied } : { error: res.error },
  });
  revalidatePath(`/accounting/payments/${paymentId}`);
  revalidatePath("/accounting/payments");
  revalidatePath("/accounting/collections");
}

/** Settle the oldest invoices first with whatever is unapplied on a receipt. */
export async function autoApplyPaymentAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const paymentId = String(formData.get("paymentId") ?? "");
  if (!paymentId) return;
  const p = await db.query.payments.findFirst({ where: eq(payments.id, paymentId) });
  if (!p?.bpId) return;

  const open = await openInvoicesFor(p.bpId);
  const lines = allocateOldestFirst(Number(p.amount), open);
  const res = await applyPayment(paymentId, lines, user.id);
  await audit({ userId: user.id, action: "ar.payment_auto_apply", entityType: "payment", entityId: paymentId, metadata: res.ok ? { applied: res.applied } : { error: res.error } });
  revalidatePath(`/accounting/payments/${paymentId}`);
}

// ---------------------------------------------------------------------------
// Credit memos
// ---------------------------------------------------------------------------

async function nextMemoNumber(): Promise<string> {
  let s = await db.query.numberSeries.findFirst({ where: eq(numberSeries.documentType, "credit_memo") });
  if (!s) [s] = await db.insert(numberSeries).values({ documentType: "credit_memo", prefix: "CM-", nextNumber: 1, padding: 5 }).returning();
  const n = s.nextNumber;
  await db.update(numberSeries).set({ nextNumber: n + 1, updatedAt: new Date() }).where(eq(numberSeries.id, s.id));
  return `${s.prefix}${String(n).padStart(s.padding, "0")}`;
}

/** Raise a credit memo, optionally against an invoice (return, shortage, damage). */
export async function createCreditMemoAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const bpId = str(formData.get("bpId"));
  const invoiceId = str(formData.get("invoiceId"));
  const reason = str(formData.get("reason"));

  let resolvedBp = bpId;
  if (!resolvedBp && invoiceId) {
    const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId), columns: { bpId: true } });
    resolvedBp = inv?.bpId ?? null;
  }
  if (!resolvedBp) redirect("/accounting/credit-memos");

  const memoNumber = await nextMemoNumber();
  const [memo] = await db
    .insert(creditMemos)
    .values({ memoNumber, bpId: resolvedBp, invoiceId, status: "draft", reason, createdBy: user.id })
    .returning({ id: creditMemos.id });

  await audit({ userId: user.id, action: "ar.credit_memo_create", entityType: "credit_memo", entityId: memo.id, metadata: { memoNumber, invoiceId } });
  redirect(`/accounting/credit-memos/${memo.id}`);
}

/** Recompute a memo's totals from its lines. */
async function recalcMemo(memoId: string): Promise<void> {
  const memo = await db.query.creditMemos.findFirst({ where: eq(creditMemos.id, memoId) });
  if (!memo) return;
  const lines = await db.select().from(creditMemoLines).where(eq(creditMemoLines.memoId, memoId));
  const subtotal = round2(lines.reduce((s, l) => s + Number(l.extended), 0));
  const tax = round2(subtotal * Number(memo.taxRate));
  await db
    .update(creditMemos)
    .set({ subtotal: subtotal.toFixed(2), tax: tax.toFixed(2), total: round2(subtotal + tax).toFixed(2), updatedAt: new Date() })
    .where(eq(creditMemos.id, memoId));
}

export async function addCreditMemoLineAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const memoId = String(formData.get("memoId") ?? "");
  const description = str(formData.get("description"));
  if (!memoId || !description) return;
  const qty = Math.max(1, Math.round(num(formData.get("qty")) || 1));
  const unitPrice = round2(num(formData.get("unitPrice")));
  const [max] = await db.select({ n: creditMemoLines.sortOrder }).from(creditMemoLines).where(eq(creditMemoLines.memoId, memoId)).orderBy(creditMemoLines.sortOrder);
  await db.insert(creditMemoLines).values({
    memoId,
    description,
    qty,
    unitPrice: unitPrice.toFixed(2),
    extended: round2(qty * unitPrice).toFixed(2),
    sortOrder: (max?.n ?? 0) + 1,
  });
  await recalcMemo(memoId);
  await audit({ userId: user.id, action: "ar.credit_memo_line_add", entityType: "credit_memo", entityId: memoId, metadata: { description } });
  revalidatePath(`/accounting/credit-memos/${memoId}`);
}

export async function removeCreditMemoLineAction(formData: FormData): Promise<void> {
  await requireAccountingEdit();
  const memoId = String(formData.get("memoId") ?? "");
  const lineId = String(formData.get("lineId") ?? "");
  if (!memoId || !lineId) return;
  await db.delete(creditMemoLines).where(eq(creditMemoLines.id, lineId));
  await recalcMemo(memoId);
  revalidatePath(`/accounting/credit-memos/${memoId}`);
}

export async function updateCreditMemoAction(formData: FormData): Promise<void> {
  await requireAccountingEdit();
  const memoId = String(formData.get("memoId") ?? "");
  if (!memoId) return;
  const taxRate = num(formData.get("taxRate"));
  await db
    .update(creditMemos)
    .set({ reason: str(formData.get("reason")), notes: str(formData.get("notes")), taxRate: (taxRate > 1 ? taxRate / 100 : taxRate).toFixed(4), updatedAt: new Date() })
    .where(eq(creditMemos.id, memoId));
  await recalcMemo(memoId);
  revalidatePath(`/accounting/credit-memos/${memoId}`);
}

/** Issue the memo: it posts to the GL and becomes available to apply. */
export async function issueCreditMemoAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const memoId = String(formData.get("memoId") ?? "");
  if (!memoId) return;
  const memo = await db.query.creditMemos.findFirst({ where: eq(creditMemos.id, memoId) });
  if (!memo || memo.status !== "draft" || Number(memo.total) <= 0) return;

  await db.update(creditMemos).set({ status: "open", issueDate: memo.issueDate ?? new Date(), updatedAt: new Date() }).where(eq(creditMemos.id, memoId));
  await postCreditMemoToGl(memoId, user.id);
  if (memo.bpId) await recomputeAccountBalanceFromApplications(memo.bpId);
  await audit({ userId: user.id, action: "ar.credit_memo_issue", entityType: "credit_memo", entityId: memoId, metadata: { memoNumber: memo.memoNumber, total: memo.total } });
  revalidatePath(`/accounting/credit-memos/${memoId}`);
  revalidatePath("/accounting/credit-memos");
}

/** Apply an open credit memo across invoices. */
export async function applyCreditMemoAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const memoId = String(formData.get("memoId") ?? "");
  if (!memoId) return;
  const res = await applyCreditMemo(memoId, applyLines(formData), user.id);
  await audit({ userId: user.id, action: "ar.credit_memo_apply", entityType: "credit_memo", entityId: memoId, metadata: res.ok ? { applied: res.applied } : { error: res.error } });
  revalidatePath(`/accounting/credit-memos/${memoId}`);
  revalidatePath("/accounting/collections");
}

export async function voidCreditMemoAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const memoId = String(formData.get("memoId") ?? "");
  const reason = str(formData.get("reason")) ?? "Voided";
  if (!memoId) return;
  const memo = await db.query.creditMemos.findFirst({ where: eq(creditMemos.id, memoId) });
  if (!memo || memo.voidedAt) return;

  await db.update(creditMemos).set({ status: "void", voidedAt: new Date(), voidReason: reason, updatedAt: new Date() }).where(eq(creditMemos.id, memoId));
  await reverseGlForSource("credit_memo", memoId, user.id, reason);
  // Applications die with the memo, so every invoice it touched has to re-derive.
  const touched = await db.query.arApplications.findMany({ where: (a, { eq: e }) => e(a.creditMemoId, memoId), columns: { invoiceId: true } });
  await db.delete(creditMemoLines).where(eq(creditMemoLines.memoId, memoId)).catch(() => {});
  for (const t of touched) await refreshInvoiceFromApplications(t.invoiceId);
  if (memo.bpId) await recomputeAccountBalanceFromApplications(memo.bpId);
  await audit({ userId: user.id, action: "ar.credit_memo_void", entityType: "credit_memo", entityId: memoId, metadata: { reason } });
  revalidatePath(`/accounting/credit-memos/${memoId}`);
}

// ---------------------------------------------------------------------------
// Deposits
// ---------------------------------------------------------------------------

export async function createDepositAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const paymentIds = formData.getAll("paymentIds").map(String).filter(Boolean);
  const bankAccountId = String(formData.get("bankAccountId") ?? "");
  const dateStr = String(formData.get("depositDate") ?? "").trim();
  const depositDate = dateStr ? new Date(`${dateStr}T12:00:00`) : new Date();
  const method = String(formData.get("method") ?? "check") as "check" | "ach" | "card" | "cash" | "credit" | "other";

  const res = await createDeposit(
    { paymentIds, bankAccountId, depositDate, method, reference: str(formData.get("reference")), notes: str(formData.get("notes")) },
    user.id,
  );
  await audit({
    userId: user.id,
    action: "ar.deposit_create",
    entityType: "deposit",
    entityId: res.ok ? res.id : "—",
    metadata: res.ok ? { depositNumber: res.depositNumber, total: res.total, receipts: paymentIds.length } : { error: res.error },
  });
  revalidatePath("/accounting/deposits");
  revalidatePath("/accounting/reconcile");
}

export async function voidDepositAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const depositId = String(formData.get("depositId") ?? "");
  const reason = str(formData.get("reason")) ?? "Voided";
  if (!depositId) return;
  const res = await voidDeposit(depositId, user.id, reason);
  await audit({ userId: user.id, action: "ar.deposit_void", entityType: "deposit", entityId: depositId, metadata: { reason, ok: res.ok } });
  revalidatePath("/accounting/deposits");
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

/** Record that the card on file was run for an invoice (or that it failed). */
export async function markCardChargedAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const note = str(formData.get("note"));
  const clear = String(formData.get("clear") ?? "") === "1";
  if (!invoiceId) return;

  await db
    .update(invoices)
    .set({ cardChargedAt: clear ? null : new Date(), cardChargeNote: clear ? null : note, updatedAt: new Date() })
    .where(eq(invoices.id, invoiceId));
  await audit({ userId: user.id, action: clear ? "ar.card_charge_clear" : "ar.card_charge_mark", entityType: "invoice", entityId: invoiceId, metadata: { note } });
  revalidatePath("/accounting/collections");
}
