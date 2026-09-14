import "server-only";
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  arApplications,
  billPayments,
  bills,
  businessPartners,
  creditMemos,
  deposits,
  glAccounts,
  invoices,
  journalEntries,
  journalLines,
  payments,
} from "@/db/schema";
import { accountTotals } from "./journal";
import { incomeStatement, segmentPnl, type SegmentPnl } from "./statements";
import { buildFiscalYear, fiscalYearOf, quarterRange, weekRange, ytdRange } from "./fiscal";
import { fiscalStartMonth } from "./fiscal-service";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

// ---------------------------------------------------------------------------
// Finance pulse — the four numbers management actually watches
// ---------------------------------------------------------------------------

export interface Trend {
  label: string;
  thisPeriod: number;
  lastPeriod: number;
  changePct: number | null;
  /** true when up is good (money in), false when up is bad (money out). */
  upIsGood: boolean;
}

export interface FinancePulse {
  cashOnHand: number;
  cashAccounts: { code: string; name: string; balance: number }[];
  incoming: Trend;
  outgoing: Trend;
  invoiced: Trend;
  arOpen: number;
  arOverdue: number;
  dso: number | null;
  undeposited: number;
  unappliedCash: number;
  openCredits: number;
}

function trend(label: string, thisPeriod: number, lastPeriod: number, upIsGood: boolean): Trend {
  const changePct = lastPeriod > 0 ? round2(((thisPeriod - lastPeriod) / lastPeriod) * 100) : null;
  return { label, thisPeriod: round2(thisPeriod), lastPeriod: round2(lastPeriod), changePct, upIsGood };
}

async function sumBetween(
  table: "payments" | "billPayments" | "invoices",
  from: Date,
  to: Date,
): Promise<number> {
  if (table === "payments") {
    const [r] = await db
      .select({ n: sql<string>`COALESCE(SUM(${payments.amount}), 0)` })
      .from(payments)
      .where(and(gte(payments.receivedDate, from), lte(payments.receivedDate, to)));
    return Number(r?.n ?? 0);
  }
  if (table === "billPayments") {
    const [r] = await db
      .select({ n: sql<string>`COALESCE(SUM(${billPayments.amount}), 0)` })
      .from(billPayments)
      .where(and(gte(billPayments.paidDate, from), lte(billPayments.paidDate, to)));
    return Number(r?.n ?? 0);
  }
  const [r] = await db
    .select({ n: sql<string>`COALESCE(SUM(${invoices.total}), 0)` })
    .from(invoices)
    .where(and(gte(invoices.issueDate, from), lte(invoices.issueDate, to), isNull(invoices.voidedAt)));
  return Number(r?.n ?? 0);
}

/** Cash, collections, payments and AR health as of a moment. */
export async function financePulse(asOf = new Date()): Promise<FinancePulse> {
  const thisStart = startOfMonth(asOf);
  const lastStart = addMonths(thisStart, -1);
  const lastEnd = new Date(thisStart.getTime() - 1);

  // Cash on hand = the balance of every bank/cash account.
  const totals = await accountTotals({ to: asOf });
  const cashAccounts = totals
    .filter((a) => a.type === "asset" && /checking|money market|petty cash|^cash/i.test(a.name))
    .map((a) => ({ code: a.code, name: a.name, balance: round2(a.balance) }))
    .filter((a) => a.balance !== 0);
  const cashOnHand = round2(cashAccounts.reduce((s, a) => s + a.balance, 0));

  const [inThis, inLast, outThis, outLast, invThis, invLast] = await Promise.all([
    sumBetween("payments", thisStart, asOf),
    sumBetween("payments", lastStart, lastEnd),
    sumBetween("billPayments", thisStart, asOf),
    sumBetween("billPayments", lastStart, lastEnd),
    sumBetween("invoices", thisStart, asOf),
    sumBetween("invoices", lastStart, lastEnd),
  ]);

  // Open AR straight off the applications sub-ledger.
  const [ar] = await db
    .select({
      open: sql<string>`COALESCE(SUM(${invoices.total} - COALESCE((SELECT SUM(a.amount) FROM ar_applications a WHERE a.invoice_id = "invoices"."id"), 0)), 0)`,
      overdue: sql<string>`COALESCE(SUM(CASE WHEN ${invoices.dueDate} < ${asOf} THEN ${invoices.total} - COALESCE((SELECT SUM(a.amount) FROM ar_applications a WHERE a.invoice_id = "invoices"."id"), 0) ELSE 0 END), 0)`,
    })
    .from(invoices)
    .where(and(isNull(invoices.voidedAt), sql`${invoices.status} <> 'draft'`));

  const arOpen = round2(Number(ar?.open ?? 0));
  const arOverdue = round2(Number(ar?.overdue ?? 0));

  // DSO on the last 90 days of billing: open AR / average daily sales.
  const ninetyAgo = new Date(asOf.getTime() - 90 * 86_400_000);
  const billed90 = await sumBetween("invoices", ninetyAgo, asOf);
  const dso = billed90 > 0 ? Math.round(arOpen / (billed90 / 90)) : null;

  const [undep] = await db
    .select({ n: sql<string>`COALESCE(SUM(${payments.amount}), 0)` })
    .from(payments)
    .where(isNull(payments.depositId));

  const [unapplied] = await db
    .select({
      n: sql<string>`COALESCE(SUM(${payments.amount} - COALESCE((SELECT SUM(a.amount) FROM ar_applications a WHERE a.payment_id = "payments"."id"), 0)), 0)`,
    })
    .from(payments);

  const [credits] = await db
    .select({
      n: sql<string>`COALESCE(SUM(${creditMemos.total} - COALESCE((SELECT SUM(a.amount) FROM ar_applications a WHERE a.credit_memo_id = "credit_memos"."id"), 0)), 0)`,
    })
    .from(creditMemos)
    .where(and(isNull(creditMemos.voidedAt), sql`${creditMemos.status} <> 'draft'`));

  return {
    cashOnHand,
    cashAccounts,
    incoming: trend("Money in", inThis, inLast, true),
    outgoing: trend("Money out", outThis, outLast, false),
    invoiced: trend("Invoiced", invThis, invLast, true),
    arOpen,
    arOverdue,
    dso,
    undeposited: round2(Number(undep?.n ?? 0)),
    unappliedCash: round2(Number(unapplied?.n ?? 0)),
    openCredits: round2(Number(credits?.n ?? 0)),
  };
}

// ---------------------------------------------------------------------------
// Weekly flash
// ---------------------------------------------------------------------------

export interface WeeklyFlash {
  weekStart: string;
  weekEnd: string;
  cashIn: number;
  cashOut: number;
  netCash: number;
  invoiced: number;
  invoiceCount: number;
  creditsRaised: number;
  deposited: number;
  depositCount: number;
  newOverdue: number;
  topReceipts: { customer: string; amount: number; reference: string | null }[];
  topInvoices: { customer: string; number: string; amount: number }[];
  priorWeek: { cashIn: number; cashOut: number; invoiced: number };
}

/** One week of cash and billing — the Monday-morning flash. */
export async function weeklyFlash(anchor = new Date()): Promise<WeeklyFlash> {
  const wk = weekRange(anchor);
  const from = new Date(`${wk.startDate}T00:00:00`);
  const to = endOfDay(new Date(`${wk.endDate}T00:00:00`));
  const prevFrom = new Date(from.getTime() - 7 * 86_400_000);
  const prevTo = new Date(to.getTime() - 7 * 86_400_000);

  const [cashIn, cashOut, invoiced, prevIn, prevOut, prevInvoiced] = await Promise.all([
    sumBetween("payments", from, to),
    sumBetween("billPayments", from, to),
    sumBetween("invoices", from, to),
    sumBetween("payments", prevFrom, prevTo),
    sumBetween("billPayments", prevFrom, prevTo),
    sumBetween("invoices", prevFrom, prevTo),
  ]);

  const [invCount] = await db
    .select({ n: sql<string>`COUNT(*)` })
    .from(invoices)
    .where(and(gte(invoices.issueDate, from), lte(invoices.issueDate, to), isNull(invoices.voidedAt)));

  const [credits] = await db
    .select({ n: sql<string>`COALESCE(SUM(${creditMemos.total}), 0)` })
    .from(creditMemos)
    .where(and(gte(creditMemos.issueDate, from), lte(creditMemos.issueDate, to), isNull(creditMemos.voidedAt)));

  const [dep] = await db
    .select({ n: sql<string>`COALESCE(SUM(${deposits.total}), 0)`, c: sql<string>`COUNT(*)` })
    .from(deposits)
    .where(and(gte(deposits.depositDate, from), lte(deposits.depositDate, to), sql`${deposits.status} <> 'void'`));

  // Invoices that fell past due during the week.
  const [newOverdue] = await db
    .select({
      n: sql<string>`COALESCE(SUM(${invoices.total} - COALESCE((SELECT SUM(a.amount) FROM ar_applications a WHERE a.invoice_id = "invoices"."id"), 0)), 0)`,
    })
    .from(invoices)
    .where(and(gte(invoices.dueDate, from), lte(invoices.dueDate, to), isNull(invoices.voidedAt), sql`${invoices.status} <> 'draft'`));

  const topReceipts = (
    await db
      .select({ amount: payments.amount, reference: payments.reference, customer: businessPartners.companyName })
      .from(payments)
      .leftJoin(businessPartners, eq(businessPartners.id, payments.bpId))
      .where(and(gte(payments.receivedDate, from), lte(payments.receivedDate, to)))
      .orderBy(sql`${payments.amount} DESC`)
      .limit(5)
  ).map((r) => ({ customer: r.customer ?? "—", amount: Number(r.amount), reference: r.reference }));

  const topInvoices = (
    await db
      .select({ number: invoices.invoiceNumber, amount: invoices.total, customer: businessPartners.companyName })
      .from(invoices)
      .leftJoin(businessPartners, eq(businessPartners.id, invoices.bpId))
      .where(and(gte(invoices.issueDate, from), lte(invoices.issueDate, to), isNull(invoices.voidedAt)))
      .orderBy(sql`${invoices.total} DESC`)
      .limit(5)
  ).map((r) => ({ customer: r.customer ?? "—", number: r.number, amount: Number(r.amount) }));

  return {
    weekStart: wk.startDate,
    weekEnd: wk.endDate,
    cashIn: round2(cashIn),
    cashOut: round2(cashOut),
    netCash: round2(cashIn - cashOut),
    invoiced: round2(invoiced),
    invoiceCount: Number(invCount?.n ?? 0),
    creditsRaised: round2(Number(credits?.n ?? 0)),
    deposited: round2(Number(dep?.n ?? 0)),
    depositCount: Number(dep?.c ?? 0),
    newOverdue: round2(Number(newOverdue?.n ?? 0)),
    topReceipts,
    topInvoices,
    priorWeek: { cashIn: round2(prevIn), cashOut: round2(prevOut), invoiced: round2(prevInvoiced) },
  };
}

// ---------------------------------------------------------------------------
// Quarterly pack
// ---------------------------------------------------------------------------

export interface QuarterPnl {
  label: string;
  from: string;
  to: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number | null;
  operating: number;
  netIncome: number;
}

export interface QuarterlyPack {
  fiscalYear: number;
  quarter: number;
  current: QuarterPnl;
  priorYear: QuarterPnl;
  ytd: QuarterPnl;
  priorYtd: QuarterPnl;
  quarters: QuarterPnl[]; // all four of the current fiscal year
  segments: SegmentPnl;
  cashIn: number;
  cashOut: number;
  arOpen: number;
}

async function pnlFor(label: string, fromStr: string, toStr: string): Promise<QuarterPnl> {
  const from = new Date(`${fromStr}T00:00:00`);
  const to = endOfDay(new Date(`${toStr}T00:00:00`));
  const s = await incomeStatement(from, to);
  return {
    label,
    from: fromStr,
    to: toStr,
    revenue: s.revenue.total,
    cogs: s.cogs.total,
    grossProfit: s.grossProfit,
    grossMarginPct: s.revenue.total !== 0 ? round2((s.grossProfit / s.revenue.total) * 100) : null,
    operating: s.operating.total,
    netIncome: s.netIncome,
  };
}

/** A quarter's P&L with its prior-year comparative, the year to date, all four
 *  quarters side by side, and the segment split. */
export async function quarterlyPack(fiscalYear?: number, quarter?: number, asOf = new Date()): Promise<QuarterlyPack> {
  const startMonth = await fiscalStartMonth();
  const today = asOf.toISOString().slice(0, 10);
  const fy = fiscalYear ?? fiscalYearOf(today, startMonth);

  const fyDef = buildFiscalYear(fy, startMonth);
  const currentPeriod = fyDef.periods.find((p) => today >= p.startDate && today <= p.endDate);
  const q = quarter ?? currentPeriod?.quarter ?? 4;

  const cur = quarterRange(fy, q, startMonth);
  const prior = quarterRange(fy - 1, q, startMonth);
  const ytdCur = ytdRange(cur.endDate, startMonth);
  const priorFy = buildFiscalYear(fy - 1, startMonth);

  const [current, priorYear, ytd, priorYtd] = await Promise.all([
    pnlFor(`FY${fy} Q${q}`, cur.startDate, cur.endDate),
    pnlFor(`FY${fy - 1} Q${q}`, prior.startDate, prior.endDate),
    pnlFor(`FY${fy} YTD`, fyDef.startDate, cur.endDate),
    pnlFor(`FY${fy - 1} YTD`, priorFy.startDate, prior.endDate),
  ]);

  const quarters = await Promise.all(
    [1, 2, 3, 4].map((n) => {
      const r = quarterRange(fy, n, startMonth);
      return pnlFor(`Q${n}`, r.startDate, r.endDate);
    }),
  );

  const from = new Date(`${cur.startDate}T00:00:00`);
  const to = endOfDay(new Date(`${cur.endDate}T00:00:00`));
  const [segments, cashIn, cashOut] = await Promise.all([
    segmentPnl(from, to),
    sumBetween("payments", from, to),
    sumBetween("billPayments", from, to),
  ]);

  const [ar] = await db
    .select({
      open: sql<string>`COALESCE(SUM(${invoices.total} - COALESCE((SELECT SUM(a.amount) FROM ar_applications a WHERE a.invoice_id = "invoices"."id"), 0)), 0)`,
    })
    .from(invoices)
    .where(and(isNull(invoices.voidedAt), sql`${invoices.status} <> 'draft'`, lte(invoices.issueDate, to)));

  return {
    fiscalYear: fy,
    quarter: q,
    current,
    priorYear,
    ytd,
    priorYtd,
    quarters,
    segments,
    cashIn: round2(cashIn),
    cashOut: round2(cashOut),
    arOpen: round2(Number(ar?.open ?? 0)),
  };
}

// ---------------------------------------------------------------------------
// Close checklist
// ---------------------------------------------------------------------------

export interface CloseCheck {
  key: string;
  label: string;
  detail: string;
  count: number;
  amount: number | null;
  blocking: boolean;
}

/** What is still outstanding before a period can be locked. */
export async function closeChecklist(periodStart: string, periodEnd: string): Promise<CloseCheck[]> {
  const from = new Date(`${periodStart}T00:00:00`);
  const to = endOfDay(new Date(`${periodEnd}T00:00:00`));

  const [drafts] = await db
    .select({ n: sql<string>`COUNT(*)`, amt: sql<string>`COALESCE(SUM(${journalLines.debit}), 0)` })
    .from(journalEntries)
    .leftJoin(journalLines, eq(journalLines.entryId, journalEntries.id))
    .where(and(eq(journalEntries.status, "draft"), gte(journalEntries.date, from), lte(journalEntries.date, to)));

  const [draftInvoices] = await db
    .select({ n: sql<string>`COUNT(*)`, amt: sql<string>`COALESCE(SUM(${invoices.total}), 0)` })
    .from(invoices)
    .where(and(eq(invoices.status, "draft"), gte(invoices.createdAt, from), lte(invoices.createdAt, to)));

  const [draftBills] = await db
    .select({ n: sql<string>`COUNT(*)`, amt: sql<string>`COALESCE(SUM(${bills.total}), 0)` })
    .from(bills)
    .where(and(eq(bills.status, "draft"), gte(bills.createdAt, from), lte(bills.createdAt, to)));

  const [undeposited] = await db
    .select({ n: sql<string>`COUNT(*)`, amt: sql<string>`COALESCE(SUM(${payments.amount}), 0)` })
    .from(payments)
    .where(and(isNull(payments.depositId), lte(payments.receivedDate, to)));

  const [unapplied] = await db
    .select({
      n: sql<string>`COUNT(*)`,
      amt: sql<string>`COALESCE(SUM(${payments.amount} - COALESCE((SELECT SUM(a.amount) FROM ar_applications a WHERE a.payment_id = "payments"."id"), 0)), 0)`,
    })
    .from(payments)
    .where(and(lte(payments.receivedDate, to), sql`${payments.amount} > COALESCE((SELECT SUM(a.amount) FROM ar_applications a WHERE a.payment_id = "payments"."id"), 0)`));

  const [dueReversals] = await db
    .select({ n: sql<string>`COUNT(*)` })
    .from(journalEntries)
    .where(and(eq(journalEntries.status, "posted"), lte(journalEntries.autoReverseOn, periodEnd), sql`NOT EXISTS (SELECT 1 FROM journal_entries r WHERE r.reverses_entry_id = "journal_entries"."id" AND r.status <> 'void')`));

  const n = (v: { n: string } | undefined) => Number(v?.n ?? 0);
  const a = (v: { amt: string } | undefined) => round2(Number(v?.amt ?? 0));

  return [
    { key: "draft_journals", label: "Draft journal entries", detail: "Unposted entries dated in this period.", count: n(drafts), amount: a(drafts), blocking: true },
    { key: "draft_invoices", label: "Draft invoices", detail: "Billing raised but never issued — revenue would be missed.", count: n(draftInvoices), amount: a(draftInvoices), blocking: true },
    { key: "draft_bills", label: "Draft vendor bills", detail: "Costs entered but not approved into AP.", count: n(draftBills), amount: a(draftBills), blocking: true },
    { key: "reversals", label: "Accrual reversals due", detail: "Accruals whose reversal date has passed and not yet unwound.", count: n(dueReversals), amount: null, blocking: true },
    { key: "undeposited", label: "Receipts not banked", detail: "Cash sitting in Checks Clearing at period end — fine if genuinely in transit.", count: n(undeposited), amount: a(undeposited), blocking: false },
    { key: "unapplied", label: "Cash on account", detail: "Receipts not matched to an invoice. Apply what you can before closing.", count: n(unapplied), amount: a(unapplied), blocking: false },
  ];
}
