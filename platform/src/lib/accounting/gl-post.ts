import "server-only";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { glAccounts, journalEntries, invoices, payments } from "@/db/schema";
import { createJournal, voidJournal, type DraftLine } from "./journal";

/** Resolve system GL accounts (by system_key) that are active. */
async function systemAccounts(keys: string[]): Promise<Record<string, string>> {
  const rows = await db.select({ id: glAccounts.id, key: glAccounts.systemKey })
    .from(glAccounts).where(and(inArray(glAccounts.systemKey, keys), eq(glAccounts.active, true)));
  const map: Record<string, string> = {};
  for (const r of rows) if (r.key) map[r.key] = r.id;
  return map;
}

async function alreadyPosted(source: string, sourceId: string): Promise<boolean> {
  const e = await db.query.journalEntries.findFirst({
    where: and(eq(journalEntries.source, source), eq(journalEntries.sourceId, sourceId), ne(journalEntries.status, "void")),
    columns: { id: true },
  });
  return !!e;
}

/** Post an issued invoice to the GL:
 *    Dr Accounts Receivable (total) + Dr Sales Discounts (discount)
 *    Cr Sales Revenue (subtotal)
 *  Idempotent and best-effort — never throws into the AR flow, and silently
 *  skips if the GL system accounts aren't set up. */
export async function postInvoiceToGl(invoiceId: string, userId: string): Promise<void> {
  try {
    if (await alreadyPosted("invoice", invoiceId)) return;
    const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) });
    if (!inv || inv.voidedAt) return;
    const total = Number(inv.total), subtotal = Number(inv.subtotal), discount = Number(inv.discount);
    if (subtotal <= 0) return;
    const acc = await systemAccounts(["ar", "sales", "sales_discounts"]);
    if (!acc.ar || !acc.sales) return; // GL not configured yet

    const lines: DraftLine[] = [
      { accountId: acc.ar, debit: total, credit: 0, memo: `Invoice ${inv.invoiceNumber}` },
    ];
    if (discount > 0 && acc.sales_discounts) {
      lines.push({ accountId: acc.sales, debit: 0, credit: subtotal, memo: `Invoice ${inv.invoiceNumber}` });
      lines.push({ accountId: acc.sales_discounts, debit: discount, credit: 0, memo: `Discount ${inv.invoiceNumber}` });
    } else {
      // No discounts account (or no discount): recognise revenue at the net total.
      lines.push({ accountId: acc.sales, debit: 0, credit: total, memo: `Invoice ${inv.invoiceNumber}` });
    }
    await createJournal({ date: inv.issueDate ?? new Date(), memo: `Invoice ${inv.invoiceNumber}`, lines, source: "invoice", sourceId: invoiceId, post: true }, userId);
  } catch (e) {
    console.error("postInvoiceToGl failed", e);
  }
}

/** Post a received payment: Dr Cash / Cr Accounts Receivable. */
export async function postPaymentToGl(paymentId: string, userId: string): Promise<void> {
  try {
    if (await alreadyPosted("payment", paymentId)) return;
    const p = await db.query.payments.findFirst({ where: eq(payments.id, paymentId) });
    if (!p) return;
    const amount = Number(p.amount);
    if (amount <= 0) return;
    const acc = await systemAccounts(["cash", "ar"]);
    if (!acc.cash || !acc.ar) return;
    const ref = (p.reference ?? "").trim();
    const lines: DraftLine[] = [
      { accountId: acc.cash, debit: amount, credit: 0, memo: `Payment${ref ? ` ${ref}` : ""}` },
      { accountId: acc.ar, debit: 0, credit: amount, memo: "Customer payment" },
    ];
    await createJournal({ date: p.receivedDate ?? new Date(), memo: "Customer payment", lines, source: "payment", sourceId: paymentId, post: true }, userId);
  } catch (e) {
    console.error("postPaymentToGl failed", e);
  }
}

/** Void the GL entries posted from a source document (e.g. a voided invoice). */
export async function reverseGlForSource(source: string, sourceId: string, userId: string, reason: string): Promise<void> {
  try {
    const entries = await db.select({ id: journalEntries.id }).from(journalEntries)
      .where(and(eq(journalEntries.source, source), eq(journalEntries.sourceId, sourceId), ne(journalEntries.status, "void")));
    for (const e of entries) await voidJournal(e.id, userId, reason);
  } catch (e) {
    console.error("reverseGlForSource failed", e);
  }
}
