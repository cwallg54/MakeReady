import "server-only";
import { and, asc, desc, eq, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  billPayments,
  bills,
  glAccounts,
  numberSeries,
  paymentRunLines,
  paymentRuns,
  vendorCreditApplications,
  vendorCredits,
  vendors,
} from "@/db/schema";
import { createJournal, voidJournal, type DraftLine } from "./journal";
import { refreshBill } from "./ap";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

async function nextNumber(documentType: string, prefix: string): Promise<string> {
  let s = await db.query.numberSeries.findFirst({ where: eq(numberSeries.documentType, documentType) });
  if (!s) [s] = await db.insert(numberSeries).values({ documentType, prefix, nextNumber: 1, padding: 5 }).returning();
  const n = s.nextNumber;
  await db.update(numberSeries).set({ nextNumber: n + 1, updatedAt: new Date() }).where(eq(numberSeries.id, s.id));
  return `${s.prefix}${String(n).padStart(s.padding, "0")}`;
}

// ---------------------------------------------------------------------------
// What is payable
// ---------------------------------------------------------------------------

export interface PayableBill {
  id: string;
  billNumber: string;
  vendorRef: string | null;
  vendorId: string | null;
  vendor: string;
  vendorTerms: string | null;
  issueDate: Date | null;
  dueDate: Date | null;
  total: number;
  paid: number;
  credits: number;
  balance: number;
  daysUntilDue: number;
}

/** Open vendor bills with what is already paid and credited against them.
 *  `dueThrough` narrows to what falls due by a date — how a run is selected. */
export async function payableBills(dueThrough?: Date): Promise<PayableBill[]> {
  const conds = [isNull(bills.voidedAt), ne(bills.status, "draft"), ne(bills.status, "paid")];
  if (dueThrough) conds.push(lte(bills.dueDate, dueThrough));

  const rows = await db
    .select({
      id: bills.id,
      billNumber: bills.billNumber,
      vendorRef: bills.vendorRef,
      vendorId: bills.vendorId,
      vendor: vendors.name,
      vendorTerms: vendors.terms,
      issueDate: bills.issueDate,
      dueDate: bills.dueDate,
      total: bills.total,
      paid: sql<string>`COALESCE((SELECT SUM(bp.amount) FROM bill_payments bp WHERE bp.bill_id = "bills"."id"), 0)`,
      credits: sql<string>`COALESCE((SELECT SUM(vca.amount) FROM vendor_credit_applications vca WHERE vca.bill_id = "bills"."id"), 0)`,
    })
    .from(bills)
    .leftJoin(vendors, eq(vendors.id, bills.vendorId))
    .where(and(...conds))
    .orderBy(asc(bills.dueDate), asc(bills.billNumber));

  const now = Date.now();
  return rows
    .map((r) => {
      const total = Number(r.total);
      const paid = Number(r.paid);
      const credits = Number(r.credits);
      return {
        ...r,
        vendor: r.vendor ?? "—",
        total,
        paid,
        credits,
        balance: round2(total - paid - credits),
        daysUntilDue: r.dueDate ? Math.round((r.dueDate.getTime() - now) / 86_400_000) : 0,
      };
    })
    .filter((r) => r.balance > 0.005);
}

// ---------------------------------------------------------------------------
// Building and paying a run
// ---------------------------------------------------------------------------

export type RunResult = { ok: true; id: string; runNumber: string; total: number; bills: number } | { ok: false; error: string };

/** Build a draft run from the bills selected on the screen. */
export async function createPaymentRun(
  input: {
    billIds: string[];
    method: "check" | "ach" | "card" | "cash" | "credit" | "other";
    bankAccountId: string;
    runDate: Date;
    dueThrough?: string | null;
    firstCheckNumber?: number | null;
    notes?: string | null;
  },
  userId: string,
): Promise<RunResult> {
  const ids = Array.from(new Set(input.billIds.filter(Boolean)));
  if (!ids.length) return { ok: false, error: "Select at least one bill to pay." };

  const payable = (await payableBills()).filter((b) => ids.includes(b.id));
  if (!payable.length) return { ok: false, error: "None of those bills are still open." };

  const total = round2(payable.reduce((s, b) => s + b.balance, 0));
  const runNumber = await nextNumber("payment_run", "PR-");

  const [run] = await db
    .insert(paymentRuns)
    .values({
      runNumber,
      runDate: input.runDate,
      dueThrough: input.dueThrough ?? null,
      method: input.method,
      bankAccountId: input.bankAccountId,
      status: "draft",
      firstCheckNumber: input.firstCheckNumber ?? null,
      total: total.toFixed(2),
      notes: input.notes ?? null,
      createdBy: userId,
    })
    .returning({ id: paymentRuns.id });

  await db.insert(paymentRunLines).values(
    payable.map((b) => ({
      runId: run.id,
      billId: b.id,
      vendorId: b.vendorId,
      amount: b.balance.toFixed(2),
      included: true,
    })),
  );

  return { ok: true, id: run.id, runNumber, total, bills: payable.length };
}

/** Approve a run — the sign-off before money moves. */
export async function approvePaymentRun(runId: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  const run = await db.query.paymentRuns.findFirst({ where: eq(paymentRuns.id, runId) });
  if (!run) return { ok: false, error: "Run not found." };
  if (run.status !== "draft") return { ok: false, error: "Only a draft run can be approved." };
  await db
    .update(paymentRuns)
    .set({ status: "approved", approvedBy: userId, approvedAt: new Date(), updatedAt: new Date() })
    .where(eq(paymentRuns.id, runId));
  return { ok: true };
}

/** Pay an approved run: one instrument per vendor, a bill_payment per bill, and
 *  a single journal entry Dr Accounts Payable / Cr Bank for the batch. */
export async function payPaymentRun(runId: string, userId: string): Promise<{ ok: boolean; error?: string; instruments?: number }> {
  const run = await db.query.paymentRuns.findFirst({ where: eq(paymentRuns.id, runId) });
  if (!run) return { ok: false, error: "Run not found." };
  if (run.status === "paid") return { ok: true };
  if (run.status !== "approved") return { ok: false, error: "The run has to be approved before it can be paid." };

  const lines = await db
    .select()
    .from(paymentRunLines)
    .where(and(eq(paymentRunLines.runId, runId), eq(paymentRunLines.included, true)));
  if (!lines.length) return { ok: false, error: "Nothing is included in this run." };

  // One instrument per vendor — a cheque pays every bill that vendor is owed.
  const byVendor = new Map<string, typeof lines>();
  for (const l of lines) {
    const key = l.vendorId ?? "none";
    if (!byVendor.has(key)) byVendor.set(key, []);
    byVendor.get(key)!.push(l);
  }

  let checkNo = run.firstCheckNumber ?? null;
  let total = 0;

  for (const [, vendorLines] of byVendor) {
    const instrument = run.method === "check" && checkNo !== null ? String(checkNo++) : null;
    for (const l of vendorLines) {
      const amount = Number(l.amount);
      if (amount <= 0) continue;
      total = round2(total + amount);
      await db.insert(billPayments).values({
        billId: l.billId,
        vendorId: l.vendorId,
        runId,
        instrumentNumber: instrument,
        method: run.method,
        reference: instrument ? `${run.runNumber} · ${instrument}` : run.runNumber,
        amount: amount.toFixed(2),
        paidDate: run.runDate,
        createdBy: userId,
      });
      await db.update(paymentRunLines).set({ instrumentNumber: instrument }).where(eq(paymentRunLines.id, l.id));
      if (l.billId) await refreshBill(l.billId);
    }
  }

  // One GL entry for the whole batch, which is what the bank statement shows.
  const acc = await db
    .select({ id: glAccounts.id, key: glAccounts.systemKey })
    .from(glAccounts)
    .where(and(eq(glAccounts.systemKey, "ap"), eq(glAccounts.active, true)));
  const apId = acc[0]?.id;
  if (apId && run.bankAccountId && total > 0) {
    const draft: DraftLine[] = [
      { accountId: apId, debit: total, credit: 0, memo: `Payment run ${run.runNumber}` },
      { accountId: run.bankAccountId, debit: 0, credit: total, memo: `${lines.length} bill${lines.length === 1 ? "" : "s"} paid` },
    ];
    await createJournal(
      { date: run.runDate, memo: `Payment run ${run.runNumber}`, lines: draft, source: "payment_run", sourceId: runId, post: true },
      userId,
    );
  }

  await db
    .update(paymentRuns)
    .set({ status: "paid", paidAt: new Date(), total: total.toFixed(2), updatedAt: new Date() })
    .where(eq(paymentRuns.id, runId));

  return { ok: true, instruments: byVendor.size };
}

/** Void a run: reverse the bank posting and undo its bill payments. */
export async function voidPaymentRun(runId: string, userId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const run = await db.query.paymentRuns.findFirst({ where: eq(paymentRuns.id, runId) });
  if (!run) return { ok: false, error: "Run not found." };
  if (run.status === "void") return { ok: true };

  const paid = await db.select({ billId: billPayments.billId }).from(billPayments).where(eq(billPayments.runId, runId));
  await db.delete(billPayments).where(eq(billPayments.runId, runId));
  for (const p of paid) if (p.billId) await refreshBill(p.billId);

  const entry = await db.query.journalEntries.findFirst({
    where: (j, { and: a, eq: e }) => a(e(j.source, "payment_run"), e(j.sourceId, runId)),
    columns: { id: true },
  });
  if (entry) await voidJournal(entry.id, userId, reason || `Payment run ${run.runNumber} voided`);

  await db.update(paymentRuns).set({ status: "void", notes: reason || run.notes, updatedAt: new Date() }).where(eq(paymentRuns.id, runId));
  return { ok: true };
}

export async function listPaymentRuns(limit = 40) {
  const rows = await db
    .select({
      id: paymentRuns.id,
      runNumber: paymentRuns.runNumber,
      runDate: paymentRuns.runDate,
      method: paymentRuns.method,
      status: paymentRuns.status,
      total: paymentRuns.total,
      bank: glAccounts.name,
      billCount: sql<string>`(SELECT COUNT(*) FROM payment_run_lines l WHERE l.run_id = "payment_runs"."id" AND l.included)`,
    })
    .from(paymentRuns)
    .leftJoin(glAccounts, eq(glAccounts.id, paymentRuns.bankAccountId))
    .orderBy(desc(paymentRuns.runDate), desc(paymentRuns.runNumber))
    .limit(limit);
  return rows.map((r) => ({ ...r, total: Number(r.total), billCount: Number(r.billCount) }));
}

export async function paymentRunDetail(runId: string) {
  const run = await db.query.paymentRuns.findFirst({ where: eq(paymentRuns.id, runId) });
  if (!run) return null;
  const lines = await db
    .select({
      id: paymentRunLines.id,
      billId: paymentRunLines.billId,
      amount: paymentRunLines.amount,
      included: paymentRunLines.included,
      instrumentNumber: paymentRunLines.instrumentNumber,
      billNumber: bills.billNumber,
      vendorRef: bills.vendorRef,
      dueDate: bills.dueDate,
      vendor: vendors.name,
    })
    .from(paymentRunLines)
    .leftJoin(bills, eq(bills.id, paymentRunLines.billId))
    .leftJoin(vendors, eq(vendors.id, paymentRunLines.vendorId))
    .where(eq(paymentRunLines.runId, runId))
    .orderBy(asc(vendors.name), asc(bills.dueDate));
  return { run, lines: lines.map((l) => ({ ...l, amount: Number(l.amount), vendor: l.vendor ?? "—" })) };
}

// ---------------------------------------------------------------------------
// GRNI — received but not invoiced
// ---------------------------------------------------------------------------

export interface GrniRow {
  poId: string | null;
  poNumber: string;
  vendor: string;
  receivedDate: Date;
  value: number;
  ageDays: number;
}

/** Goods received against a PO with no vendor bill behind them yet. This is the
 *  balance sitting in Goods Received Not Invoiced, and the month-end job is to
 *  clear the stale end of it. */
export async function grniAging(asOf = new Date()): Promise<{ rows: GrniRow[]; total: number; buckets: { label: string; value: number }[] }> {
  const received = await db.execute(sql`
    SELECT gr.id, gr.received_date, po.id AS po_id, po.po_number, v.name AS vendor,
           COALESCE(SUM(grl.qty * grl.unit_cost), 0) AS value,
           COALESCE((SELECT SUM(b.total) FROM bills b WHERE b.vendor_id = po.vendor_id AND b.voided_at IS NULL
                     AND b.issue_date >= gr.received_date - interval '7 days'
                     AND b.issue_date <= gr.received_date + interval '60 days'), 0) AS billed_nearby
    FROM goods_receipts gr
    LEFT JOIN goods_receipt_lines grl ON grl.gr_id = gr.id
    LEFT JOIN purchase_orders po ON po.id = gr.po_id
    LEFT JOIN vendors v ON v.id = po.vendor_id
    WHERE gr.received_date <= ${asOf}
    GROUP BY gr.id, gr.received_date, po.id, po.po_number, po.vendor_id, v.name
    ORDER BY gr.received_date
  `);

  const raw = (received.rows ?? received) as unknown as {
    po_id: string | null; po_number: string | null; vendor: string | null; received_date: string; value: string; billed_nearby: string;
  }[];

  const rows: GrniRow[] = raw
    .map((r) => ({
      poId: r.po_id,
      poNumber: r.po_number ?? "—",
      vendor: r.vendor ?? "—",
      receivedDate: new Date(r.received_date),
      value: round2(Number(r.value)),
      ageDays: Math.floor((asOf.getTime() - new Date(r.received_date).getTime()) / 86_400_000),
    }))
    .filter((r) => r.value > 0.005);

  const total = round2(rows.reduce((s, r) => s + r.value, 0));
  const bucket = (min: number, max: number) => round2(rows.filter((r) => r.ageDays >= min && r.ageDays < max).reduce((s, r) => s + r.value, 0));
  return {
    rows,
    total,
    buckets: [
      { label: "0–30 days", value: bucket(0, 31) },
      { label: "31–60", value: bucket(31, 61) },
      { label: "61–90", value: bucket(61, 91) },
      { label: "90+", value: round2(rows.filter((r) => r.ageDays >= 91).reduce((s, r) => s + r.value, 0)) },
    ],
  };
}

// ---------------------------------------------------------------------------
// Vendor credits
// ---------------------------------------------------------------------------

export async function vendorCreditOpen(creditId: string): Promise<number> {
  const c = await db.query.vendorCredits.findFirst({ where: eq(vendorCredits.id, creditId), columns: { total: true, voidedAt: true } });
  if (!c || c.voidedAt) return 0;
  const [row] = await db
    .select({ applied: sql<string>`COALESCE(SUM(${vendorCreditApplications.amount}), 0)` })
    .from(vendorCreditApplications)
    .where(eq(vendorCreditApplications.creditId, creditId));
  return round2(Number(c.total) - Number(row?.applied ?? 0));
}

/** Apply a vendor credit across that vendor's open bills. */
export async function applyVendorCredit(
  creditId: string,
  lines: { billId: string; amount: number }[],
  userId: string,
): Promise<{ ok: true; applied: number } | { ok: false; error: string }> {
  const credit = await db.query.vendorCredits.findFirst({ where: eq(vendorCredits.id, creditId) });
  if (!credit) return { ok: false, error: "Credit not found." };
  if (credit.voidedAt) return { ok: false, error: "That credit is void." };

  const clean = lines
    .map((l) => ({ billId: l.billId, amount: round2(Math.max(0, Number(l.amount) || 0)) }))
    .filter((l) => l.billId && l.amount > 0);
  const total = round2(clean.reduce((s, l) => s + l.amount, 0));
  if (total - Number(credit.total) > 0.005) {
    return { ok: false, error: `Applying ${total.toFixed(2)} but the credit is only ${Number(credit.total).toFixed(2)}.` };
  }

  const affected = new Set(clean.map((l) => l.billId));
  const prior = await db.select({ billId: vendorCreditApplications.billId }).from(vendorCreditApplications).where(eq(vendorCreditApplications.creditId, creditId));
  for (const p of prior) affected.add(p.billId);

  await db.transaction(async (tx) => {
    await tx.delete(vendorCreditApplications).where(eq(vendorCreditApplications.creditId, creditId));
    if (clean.length) {
      await tx.insert(vendorCreditApplications).values(
        clean.map((l) => ({ creditId, billId: l.billId, amount: l.amount.toFixed(2), createdBy: userId })),
      );
    }
    const open = round2(Number(credit.total) - total);
    await tx.update(vendorCredits).set({ status: open <= 0.005 ? "applied" : "open", updatedAt: new Date() }).where(eq(vendorCredits.id, creditId));
  });

  for (const billId of affected) await refreshBill(billId);
  return { ok: true, applied: total };
}

/** Open bills for a vendor, for the credit-application screen. */
export async function openBillsFor(vendorId: string) {
  return (await payableBills()).filter((b) => b.vendorId === vendorId);
}

export async function nextVendorCreditNumber() {
  return nextNumber("vendor_credit", "VC-");
}
