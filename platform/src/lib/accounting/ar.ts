import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { invoices, payments, businessPartners } from "@/db/schema";

/** Aging buckets (days past due) used across the AR reports. */
export const AGING_BUCKETS = ["current", "1-30", "31-60", "61-90", "90+"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

/** Which aging bucket an open balance falls in, by due date vs now. */
export function agingBucket(dueDate: Date | null, now: Date): AgingBucket {
  if (!dueDate) return "current";
  const days = Math.floor((now.getTime() - dueDate.getTime()) / 86_400_000);
  if (days <= 0) return "current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

/** Derive the invoice status from its total, amount paid, and void/sent flags. */
export function deriveStatus(opts: { total: number; paid: number; voided: boolean; issued: boolean }): "draft" | "sent" | "partial" | "paid" | "void" {
  if (opts.voided) return "void";
  if (opts.paid <= 0) return opts.issued ? "sent" : "draft";
  if (opts.paid + 0.005 >= opts.total) return "paid";
  return "partial";
}

/** Sum of payments applied to an invoice. */
export async function invoicePaid(invoiceId: string): Promise<number> {
  const [row] = await db
    .select({ paid: sql<string>`COALESCE(SUM(${payments.amount}), 0)` })
    .from(payments)
    .where(eq(payments.invoiceId, invoiceId));
  return Number(row?.paid ?? 0);
}

/**
 * Recompute and persist an invoice's status from its payments, then refresh the
 * customer's account balance. Call after any invoice or payment change.
 */
export async function refreshInvoice(invoiceId: string): Promise<void> {
  const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) });
  if (!inv) return;
  const paid = await invoicePaid(invoiceId);
  const status = deriveStatus({ total: Number(inv.total), paid, voided: !!inv.voidedAt, issued: !!inv.issueDate });
  await db.update(invoices).set({ status, updatedAt: new Date() }).where(eq(invoices.id, invoiceId));
  if (inv.bpId) await recomputeAccountBalance(inv.bpId);
}

/**
 * Recompute businessPartners.accountBalance = billed on the customer's non-void
 * invoices − payments applied to those invoices (plus on-account payments as a
 * credit). Payments against voided invoices are excluded.
 */
export async function recomputeAccountBalance(bpId: string): Promise<void> {
  const [openInvoices, bpPayments] = await Promise.all([
    db.select({ id: invoices.id, total: invoices.total }).from(invoices).where(and(eq(invoices.bpId, bpId), isNull(invoices.voidedAt))),
    db.select({ amount: payments.amount, invoiceId: payments.invoiceId }).from(payments).where(eq(payments.bpId, bpId)),
  ]);
  const openIds = new Set(openInvoices.map((i) => i.id));
  const billed = openInvoices.reduce((s, i) => s + Number(i.total), 0);
  const paid = bpPayments
    .filter((p) => p.invoiceId === null || openIds.has(p.invoiceId))
    .reduce((s, p) => s + Number(p.amount), 0);
  const balance = billed - paid;
  await db.update(businessPartners).set({ accountBalance: String(balance.toFixed(2)), updatedAt: new Date() }).where(eq(businessPartners.id, bpId));
}
