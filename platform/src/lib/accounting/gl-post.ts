import "server-only";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { glAccounts, journalEntries, invoices, payments, bills, billLines, billPayments } from "@/db/schema";
import { createJournal, voidJournal, type DraftLine } from "./journal";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

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
    const total = Number(inv.total), subtotal = Number(inv.subtotal), discount = Number(inv.discount), tax = Number(inv.tax);
    if (subtotal <= 0) return;
    const acc = await systemAccounts(["ar", "sales", "sales_discounts", "sales_tax"]);
    if (!acc.ar || !acc.sales) return; // GL not configured yet

    // Dr AR (total incl. tax) / Cr Sales (net revenue) / Cr Sales Tax Payable /
    // Dr Sales Discounts. Revenue is recognised net of discount when there's no
    // discounts account.
    const revenue = discount > 0 && acc.sales_discounts ? subtotal : subtotal - discount;
    const lines: DraftLine[] = [
      { accountId: acc.ar, debit: total, credit: 0, memo: `Invoice ${inv.invoiceNumber}` },
      { accountId: acc.sales, debit: 0, credit: revenue, memo: `Invoice ${inv.invoiceNumber}` },
    ];
    if (discount > 0 && acc.sales_discounts) lines.push({ accountId: acc.sales_discounts, debit: discount, credit: 0, memo: `Discount ${inv.invoiceNumber}` });
    if (tax > 0 && acc.sales_tax) lines.push({ accountId: acc.sales_tax, debit: 0, credit: tax, memo: `Sales tax ${inv.invoiceNumber}` });
    else if (tax > 0) lines[0].debit = total - tax; // no tax account: keep AR to the taxable total so it balances

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

/** Post an approved vendor bill: Dr each line's expense/asset account /
 *  Cr Accounts Payable (total). Idempotent, best-effort. */
export async function postBillToGl(billId: string, userId: string): Promise<void> {
  try {
    if (await alreadyPosted("bill", billId)) return;
    const bill = await db.query.bills.findFirst({ where: eq(bills.id, billId) });
    if (!bill || bill.voidedAt) return;
    const total = Number(bill.total);
    if (total <= 0) return;
    const acc = await systemAccounts(["ap", "cogs"]);
    if (!acc.ap) return;
    const lines = await db.select().from(billLines).where(eq(billLines.billId, billId));

    const draft: DraftLine[] = [];
    for (const l of lines) {
      const ext = Number(l.extended);
      if (ext === 0) continue;
      const accountId = l.accountId ?? acc.cogs; // fall back to COGS if unset
      if (!accountId) return;
      draft.push({ accountId, debit: ext, credit: 0, memo: l.description });
    }
    if (!draft.length) return;
    draft.push({ accountId: acc.ap, debit: 0, credit: total, memo: `Bill ${bill.billNumber}` });
    await createJournal({ date: bill.issueDate ?? new Date(), memo: `Bill ${bill.billNumber}${bill.vendorRef ? ` (${bill.vendorRef})` : ""}`, lines: draft, source: "bill", sourceId: billId, post: true }, userId);
  } catch (e) {
    console.error("postBillToGl failed", e);
  }
}

/** Post a vendor payment: Dr Accounts Payable / Cr Cash. */
export async function postBillPaymentToGl(paymentId: string, userId: string): Promise<void> {
  try {
    if (await alreadyPosted("bill_payment", paymentId)) return;
    const p = await db.query.billPayments.findFirst({ where: eq(billPayments.id, paymentId) });
    if (!p) return;
    const amount = Number(p.amount);
    if (amount <= 0) return;
    const acc = await systemAccounts(["ap", "cash"]);
    if (!acc.ap || !acc.cash) return;
    const ref = (p.reference ?? "").trim();
    await createJournal({ date: p.paidDate ?? new Date(), memo: "Vendor payment", lines: [
      { accountId: acc.ap, debit: amount, credit: 0, memo: "Vendor payment" },
      { accountId: acc.cash, debit: 0, credit: amount, memo: `Payment${ref ? ` ${ref}` : ""}` },
    ], source: "bill_payment", sourceId: paymentId, post: true }, userId);
  } catch (e) {
    console.error("postBillPaymentToGl failed", e);
  }
}

/** Ensure the Landed Cost Clearing account exists (their SAP acct 2398 analog),
 *  returning its id. A current-asset clearing account that the freight A/P bill
 *  is coded to; the landed allocation moves it into Inventory so it nets to zero. */
async function ensureLandedClearingAccount(): Promise<string | null> {
  const existing = await db.query.glAccounts.findFirst({ where: eq(glAccounts.systemKey, "landed_clearing"), columns: { id: true } });
  if (existing) return existing.id;
  // Pick a free code in the current-asset range.
  let code = "1498";
  for (let i = 0; i < 30; i++) {
    const c = String(1498 + i);
    const hit = await db.query.glAccounts.findFirst({ where: eq(glAccounts.code, c), columns: { id: true } });
    if (!hit) { code = c; break; }
  }
  try {
    const [row] = await db.insert(glAccounts).values({
      code, name: "Landed Cost Clearing", type: "asset", subtype: "Current Asset",
      description: "Freight/duty awaiting capitalization into inventory (landed cost).", systemKey: "landed_clearing", active: true,
    }).returning({ id: glAccounts.id });
    return row?.id ?? null;
  } catch {
    const again = await db.query.glAccounts.findFirst({ where: eq(glAccounts.systemKey, "landed_clearing"), columns: { id: true } });
    return again?.id ?? null;
  }
}

/** Post an applied landed-cost sheet: Dr Inventory / Cr Landed Cost Clearing for
 *  the freight+duty allocated to matched inventory items. The freight A/P bill is
 *  coded to the same clearing account, so it nets to zero. Idempotent, best-effort. */
export async function postLandedCostToGl(docId: string, userId: string): Promise<void> {
  try {
    if (await alreadyPosted("landed_cost", docId)) return;
    const { landedCostDocs, landedCostLines } = await import("@/db/schema");
    const doc = await db.query.landedCostDocs.findFirst({ where: eq(landedCostDocs.id, docId) });
    if (!doc || doc.status !== "applied") return;
    const lines = await db.select().from(landedCostLines).where(eq(landedCostLines.docId, docId));
    // Freight on matched items is capitalized to Inventory; freight on unmatched
    // lines (no inventory record to carry it) is expensed to COGS/freight-in — so
    // the clearing account still nets to zero. Falls back to capitalizing only
    // matched freight if there's no COGS account.
    const capitalized = round2(lines.filter((l) => l.itemId).reduce((s, l) => s + Number(l.allocated), 0));
    const unmatched = round2(lines.filter((l) => !l.itemId).reduce((s, l) => s + Number(l.allocated), 0));
    if (capitalized <= 0.005 && unmatched <= 0.005) return;
    const acc = await systemAccounts(["inventory", "cogs"]);
    if (!acc.inventory) return; // GL not configured — skip gracefully
    const clearingId = await ensureLandedClearingAccount();
    if (!clearingId) return;

    const debits: DraftLine[] = [];
    if (capitalized > 0.005) debits.push({ accountId: acc.inventory, debit: capitalized, credit: 0, memo: `Freight capitalized — ${doc.docNumber}` });
    // Only expense the unmatched freight when a COGS account exists; otherwise it
    // stays in clearing for finance to resolve (never silently misposted).
    const expensed = acc.cogs && unmatched > 0.005 ? unmatched : 0;
    if (expensed > 0) debits.push({ accountId: acc.cogs, debit: expensed, credit: 0, memo: `Freight (unmatched items) — ${doc.docNumber}` });
    if (!debits.length) return;
    const clearTotal = round2(capitalized + expensed);
    await createJournal({
      date: doc.appliedAt ?? new Date(),
      memo: `Landed cost ${doc.docNumber}${doc.shipmentRef ? ` (${doc.shipmentRef})` : ""}`,
      lines: [...debits, { accountId: clearingId, debit: 0, credit: clearTotal, memo: `Clear freight — ${doc.docNumber}` }],
      source: "landed_cost", sourceId: docId, post: true,
    }, userId);
  } catch (e) {
    console.error("postLandedCostToGl failed", e);
  }
}

/** Ensure a Late Fee Income (revenue) account exists; returns its id. */
async function ensureLateFeeIncomeAccount(): Promise<string | null> {
  const existing = await db.query.glAccounts.findFirst({ where: eq(glAccounts.systemKey, "late_fee_income"), columns: { id: true } });
  if (existing) return existing.id;
  let code = "4900";
  for (let i = 0; i < 30; i++) {
    const c = String(4900 + i);
    const hit = await db.query.glAccounts.findFirst({ where: eq(glAccounts.code, c), columns: { id: true } });
    if (!hit) { code = c; break; }
  }
  try {
    const [row] = await db.insert(glAccounts).values({
      code, name: "Late Fee Income", type: "revenue", subtype: "Other Income",
      description: "Late-payment fees charged on overdue invoices.", systemKey: "late_fee_income", active: true,
    }).returning({ id: glAccounts.id });
    return row?.id ?? null;
  } catch {
    const again = await db.query.glAccounts.findFirst({ where: eq(glAccounts.systemKey, "late_fee_income"), columns: { id: true } });
    return again?.id ?? null;
  }
}

/** Post a late fee applied to an invoice: Dr AR / Cr Late Fee Income. Idempotent
 *  per (invoice, fee) reference; best-effort. */
export async function postLateFeeToGl(invoiceId: string, feeAmount: number, userId: string): Promise<void> {
  try {
    const src = `latefee:${invoiceId}`;
    if (await alreadyPosted("late_fee", invoiceId)) return;
    if (feeAmount <= 0.005) return;
    const acc = await systemAccounts(["ar"]);
    if (!acc.ar) return;
    const incomeId = await ensureLateFeeIncomeAccount();
    if (!incomeId) return;
    await createJournal({
      date: new Date(), memo: `Late fee — invoice ${invoiceId.slice(0, 8)}`,
      lines: [
        { accountId: acc.ar, debit: round2(feeAmount), credit: 0, memo: src },
        { accountId: incomeId, debit: 0, credit: round2(feeAmount), memo: "Late fee income" },
      ],
      source: "late_fee", sourceId: invoiceId, post: true,
    }, userId);
  } catch (e) {
    console.error("postLateFeeToGl failed", e);
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
