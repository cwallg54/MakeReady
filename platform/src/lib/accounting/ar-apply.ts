import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  arApplications,
  businessPartners,
  creditMemos,
  invoices,
  payments,
  paymentTermsTable,
} from "@/db/schema";
import { deriveStatus } from "./ar";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ---------------------------------------------------------------------------
// Open balances
// ---------------------------------------------------------------------------

/** Everything applied to an invoice: receipts plus credit memos. */
export async function invoiceApplied(invoiceId: string): Promise<number> {
  const [row] = await db
    .select({ applied: sql<string>`COALESCE(SUM(${arApplications.amount}), 0)` })
    .from(arApplications)
    .where(eq(arApplications.invoiceId, invoiceId));
  // Legacy receipts recorded straight on the invoice, before applications existed.
  const [legacy] = await db
    .select({ paid: sql<string>`COALESCE(SUM(${payments.amount}), 0)` })
    .from(payments)
    .where(and(eq(payments.invoiceId, invoiceId), sql`NOT EXISTS (SELECT 1 FROM ar_applications a WHERE a.payment_id = "payments"."id")`));
  return round2(Number(row?.applied ?? 0) + Number(legacy?.paid ?? 0));
}

/** How much of a receipt is still unapplied — on-account cash. */
export async function paymentUnapplied(paymentId: string): Promise<number> {
  const p = await db.query.payments.findFirst({ where: eq(payments.id, paymentId), columns: { amount: true } });
  if (!p) return 0;
  const [row] = await db
    .select({ applied: sql<string>`COALESCE(SUM(${arApplications.amount}), 0)` })
    .from(arApplications)
    .where(eq(arApplications.paymentId, paymentId));
  return round2(Number(p.amount) - Number(row?.applied ?? 0));
}

/** How much of a credit memo is still available to apply. */
export async function creditMemoOpen(memoId: string): Promise<number> {
  const m = await db.query.creditMemos.findFirst({ where: eq(creditMemos.id, memoId), columns: { total: true, voidedAt: true } });
  if (!m || m.voidedAt) return 0;
  const [row] = await db
    .select({ applied: sql<string>`COALESCE(SUM(${arApplications.amount}), 0)` })
    .from(arApplications)
    .where(eq(arApplications.creditMemoId, memoId));
  return round2(Number(m.total) - Number(row?.applied ?? 0));
}

/** Open invoices for a customer, oldest first — the cash-application worklist. */
export async function openInvoicesFor(bpId: string): Promise<
  { id: string; invoiceNumber: string; issueDate: Date | null; dueDate: Date | null; total: number; applied: number; balance: number }[]
> {
  const rows = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      total: invoices.total,
      applied: sql<string>`COALESCE((SELECT SUM(a.amount) FROM ar_applications a WHERE a.invoice_id = "invoices"."id"), 0)`,
    })
    .from(invoices)
    .where(and(eq(invoices.bpId, bpId), isNull(invoices.voidedAt)))
    .orderBy(asc(invoices.dueDate), asc(invoices.invoiceNumber));

  return rows
    .map((r) => {
      const total = Number(r.total);
      const applied = Number(r.applied);
      return { ...r, total, applied, balance: round2(total - applied) };
    })
    .filter((r) => r.balance > 0.005);
}

// ---------------------------------------------------------------------------
// Applying cash
// ---------------------------------------------------------------------------

export interface ApplyLine {
  invoiceId: string;
  amount: number;
}

export type ApplyResult = { ok: true; applied: number; unapplied: number } | { ok: false; error: string };

/** Apply a receipt across one or more invoices. Replaces any prior application
 *  of that receipt, so the screen can be re-submitted safely. */
export async function applyPayment(paymentId: string, lines: ApplyLine[], userId: string): Promise<ApplyResult> {
  const p = await db.query.payments.findFirst({ where: eq(payments.id, paymentId) });
  if (!p) return { ok: false, error: "Payment not found." };

  const clean = lines
    .map((l) => ({ invoiceId: l.invoiceId, amount: round2(Math.max(0, Number(l.amount) || 0)) }))
    .filter((l) => l.invoiceId && l.amount > 0);

  const total = round2(clean.reduce((s, l) => s + l.amount, 0));
  const paymentAmount = Number(p.amount);
  if (total - paymentAmount > 0.005) {
    return { ok: false, error: `Applying ${total.toFixed(2)} but the receipt is only ${paymentAmount.toFixed(2)}.` };
  }

  // Never let an invoice go past its balance (allowing for what this receipt
  // already had applied, which we are about to replace).
  const ids = clean.map((l) => l.invoiceId);
  if (ids.length) {
    const balances = await db
      .select({
        id: invoices.id,
        number: invoices.invoiceNumber,
        total: invoices.total,
        applied: sql<string>`COALESCE((SELECT SUM(a.amount) FROM ar_applications a WHERE a.invoice_id = "invoices"."id" AND a.payment_id IS DISTINCT FROM ${paymentId}), 0)`,
      })
      .from(invoices)
      .where(inArray(invoices.id, ids));
    for (const l of clean) {
      const b = balances.find((x) => x.id === l.invoiceId);
      if (!b) return { ok: false, error: "One of the invoices no longer exists." };
      const open = round2(Number(b.total) - Number(b.applied));
      if (l.amount - open > 0.005) {
        return { ok: false, error: `Invoice ${b.number} only has ${open.toFixed(2)} outstanding.` };
      }
    }
  }

  const affected = new Set<string>(ids);
  const previous = await db.select({ invoiceId: arApplications.invoiceId }).from(arApplications).where(eq(arApplications.paymentId, paymentId));
  for (const r of previous) affected.add(r.invoiceId);

  await db.transaction(async (tx) => {
    await tx.delete(arApplications).where(eq(arApplications.paymentId, paymentId));
    if (clean.length) {
      await tx.insert(arApplications).values(
        clean.map((l) => ({
          invoiceId: l.invoiceId,
          source: "payment" as const,
          paymentId,
          amount: l.amount.toFixed(2),
          createdBy: userId,
        })),
      );
    }
    // Keep the legacy single-invoice pointer in step for older screens.
    await tx
      .update(payments)
      .set({ invoiceId: clean.length === 1 ? clean[0].invoiceId : null })
      .where(eq(payments.id, paymentId));
  });

  for (const id of affected) await refreshInvoiceFromApplications(id);
  if (p.bpId) await recomputeAccountBalanceFromApplications(p.bpId);

  return { ok: true, applied: total, unapplied: round2(paymentAmount - total) };
}

/** Apply a credit memo across invoices, same rules as a receipt. */
export async function applyCreditMemo(memoId: string, lines: ApplyLine[], userId: string): Promise<ApplyResult> {
  const m = await db.query.creditMemos.findFirst({ where: eq(creditMemos.id, memoId) });
  if (!m) return { ok: false, error: "Credit memo not found." };
  if (m.voidedAt) return { ok: false, error: "That credit memo is void." };

  const clean = lines
    .map((l) => ({ invoiceId: l.invoiceId, amount: round2(Math.max(0, Number(l.amount) || 0)) }))
    .filter((l) => l.invoiceId && l.amount > 0);
  const total = round2(clean.reduce((s, l) => s + l.amount, 0));
  if (total - Number(m.total) > 0.005) {
    return { ok: false, error: `Applying ${total.toFixed(2)} but the credit is only ${Number(m.total).toFixed(2)}.` };
  }

  const affected = new Set<string>(clean.map((l) => l.invoiceId));
  const previous = await db.select({ invoiceId: arApplications.invoiceId }).from(arApplications).where(eq(arApplications.creditMemoId, memoId));
  for (const r of previous) affected.add(r.invoiceId);

  await db.transaction(async (tx) => {
    await tx.delete(arApplications).where(eq(arApplications.creditMemoId, memoId));
    if (clean.length) {
      await tx.insert(arApplications).values(
        clean.map((l) => ({
          invoiceId: l.invoiceId,
          source: "credit_memo" as const,
          creditMemoId: memoId,
          amount: l.amount.toFixed(2),
          createdBy: userId,
        })),
      );
    }
    const open = round2(Number(m.total) - total);
    await tx
      .update(creditMemos)
      .set({ status: open <= 0.005 ? "applied" : "open", updatedAt: new Date() })
      .where(eq(creditMemos.id, memoId));
  });

  for (const id of affected) await refreshInvoiceFromApplications(id);
  if (m.bpId) await recomputeAccountBalanceFromApplications(m.bpId);
  return { ok: true, applied: total, unapplied: round2(Number(m.total) - total) };
}

/** Suggest an allocation: settle oldest invoices first until the cash runs out.
 *  This is what the desk does by hand with a cheque and a remittance slip. */
export function allocateOldestFirst(
  amount: number,
  open: { id: string; balance: number }[],
): ApplyLine[] {
  let left = round2(amount);
  const out: ApplyLine[] = [];
  for (const inv of open) {
    if (left <= 0.005) break;
    const take = round2(Math.min(left, inv.balance));
    if (take > 0) {
      out.push({ invoiceId: inv.id, amount: take });
      left = round2(left - take);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Balance maintenance
// ---------------------------------------------------------------------------

/** Recompute an invoice's status from applications (and legacy payments). */
export async function refreshInvoiceFromApplications(invoiceId: string): Promise<void> {
  const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) });
  if (!inv) return;
  const applied = await invoiceApplied(invoiceId);
  const status = deriveStatus({ total: Number(inv.total), paid: applied, voided: !!inv.voidedAt, issued: !!inv.issueDate });
  await db.update(invoices).set({ status, updatedAt: new Date() }).where(eq(invoices.id, invoiceId));
}

/** Customer balance = open invoices − everything applied − unapplied cash on
 *  account − unapplied credit memos. */
export async function recomputeAccountBalanceFromApplications(bpId: string): Promise<number> {
  const [row] = await db
    .select({
      billed: sql<string>`COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.bp_id = ${bpId} AND i.voided_at IS NULL), 0)`,
      applied: sql<string>`COALESCE((SELECT SUM(a.amount) FROM ar_applications a JOIN invoices i ON i.id = a.invoice_id WHERE i.bp_id = ${bpId} AND i.voided_at IS NULL), 0)`,
      // The per-row subtraction has to sit INSIDE the SUM: correlating on p.id
      // outside it would reference an ungrouped column.
      onAccount: sql<string>`COALESCE((SELECT SUM(p.amount - COALESCE((SELECT SUM(a.amount) FROM ar_applications a WHERE a.payment_id = p.id), 0)) FROM payments p WHERE p.bp_id = ${bpId}), 0)`,
      openCredits: sql<string>`COALESCE((SELECT SUM(cm.total - COALESCE((SELECT SUM(a.amount) FROM ar_applications a WHERE a.credit_memo_id = cm.id), 0)) FROM credit_memos cm WHERE cm.bp_id = ${bpId} AND cm.voided_at IS NULL AND cm.status <> 'draft'), 0)`,
    })
    .from(businessPartners)
    .where(eq(businessPartners.id, bpId))
    .limit(1);

  const balance = round2(
    Number(row?.billed ?? 0) - Number(row?.applied ?? 0) - Number(row?.onAccount ?? 0) - Number(row?.openCredits ?? 0),
  );
  await db
    .update(businessPartners)
    .set({ accountBalance: balance.toFixed(2), updatedAt: new Date() })
    .where(eq(businessPartners.id, bpId));
  return balance;
}

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------

/** Due date from an invoice date and its terms. */
export function dueDateFor(issueDate: Date, term: { netDays: number } | null): Date {
  const d = new Date(issueDate);
  d.setDate(d.getDate() + (term?.netDays ?? 30));
  return d;
}

export async function listTerms(activeOnly = true) {
  const rows = await db
    .select()
    .from(paymentTermsTable)
    .orderBy(asc(paymentTermsTable.sortOrder), asc(paymentTermsTable.name));
  return activeOnly ? rows.filter((t) => t.active) : rows;
}

/** Unapplied receipts (on-account cash) for a customer, newest first. */
export async function onAccountPayments(bpId: string) {
  const rows = await db
    .select({
      id: payments.id,
      reference: payments.reference,
      method: payments.method,
      receivedDate: payments.receivedDate,
      amount: payments.amount,
      applied: sql<string>`COALESCE((SELECT SUM(a.amount) FROM ar_applications a WHERE a.payment_id = "payments"."id"), 0)`,
    })
    .from(payments)
    .where(eq(payments.bpId, bpId))
    .orderBy(desc(payments.receivedDate));
  return rows
    .map((r) => ({ ...r, amount: Number(r.amount), unapplied: round2(Number(r.amount) - Number(r.applied)) }))
    .filter((r) => r.unapplied > 0.005);
}
