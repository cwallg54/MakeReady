import "server-only";
import { and, asc, desc, eq, inArray, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { journalEntries, journalLines, glAccounts, glSegments, numberSeries, systemSettings } from "@/db/schema";
import { accountBalance, type GlAccountType } from "./gl";
import { periodForDate, periodLock } from "./fiscal-service";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The GL period-close date (entries on/before it are locked), or null. */
export async function glClosingDate(): Promise<Date | null> {
  const s = await db.query.systemSettings.findFirst({ columns: { glClosingDate: true } });
  return s?.glClosingDate ?? null;
}
function isLocked(date: Date, closing: Date | null): boolean {
  return !!closing && date.getTime() <= closing.getTime();
}

/** Posting guard. A date is blocked when its fiscal period is locked, or when
 *  it falls on/before the legacy global closing date. Returns the period so
 *  callers can stamp it on the entry. */
async function postingGuard(date: Date): Promise<{ error?: string; periodId: string | null }> {
  const { blocked, period } = await periodLock(date);
  if (blocked) {
    return {
      error: `${period?.name ?? "That period"} is closed. Post to an open period, or reopen it in Accounting -> Periods.`,
      periodId: period?.id ?? null,
    };
  }
  if (isLocked(date, await glClosingDate())) {
    return { error: "That date is in a closed accounting period. Use a later date or reopen the period.", periodId: period?.id ?? null };
  }
  return { periodId: period?.id ?? null };
}

export interface DraftLine {
  accountId: string;
  debit: number;
  credit: number;
  memo?: string | null;
  /** Sub-ledger tie-out: the customer/vendor this line belongs to. */
  bpId?: string | null;
  /** Charge segment. Defaults to the account's own segment when omitted. */
  segmentId?: string | null;
}

/** Keep only real lines (an account and a non-zero debit or credit), and
 *  normalise so each line is purely a debit or purely a credit. */
export function cleanLines(lines: DraftLine[]): DraftLine[] {
  return lines
    .map((l) => ({ accountId: l.accountId, debit: round2(Math.max(0, Number(l.debit) || 0)), credit: round2(Math.max(0, Number(l.credit) || 0)), memo: l.memo ?? null, bpId: l.bpId ?? null, segmentId: l.segmentId ?? null }))
    .filter((l) => l.accountId && (l.debit > 0 || l.credit > 0));
}

export function totals(lines: DraftLine[]): { debit: number; credit: number; balanced: boolean } {
  const debit = round2(lines.reduce((s, l) => s + (Number(l.debit) || 0), 0));
  const credit = round2(lines.reduce((s, l) => s + (Number(l.credit) || 0), 0));
  return { debit, credit, balanced: debit === credit && debit > 0 };
}

/** Next "JE-#####" number, transactionally. Pass the active tx. */
async function nextJournalNumber(tx: typeof db): Promise<string> {
  let s = await tx.query.numberSeries.findFirst({ where: eq(numberSeries.documentType, "journal_entry") });
  if (!s) [s] = await tx.insert(numberSeries).values({ documentType: "journal_entry", prefix: "JE-", nextNumber: 1, padding: 5 }).returning();
  const n = s.nextNumber;
  await tx.update(numberSeries).set({ nextNumber: n + 1, updatedAt: new Date() }).where(eq(numberSeries.id, s.id));
  return `${s.prefix}${String(n).padStart(s.padding, "0")}`;
}

export interface CreateJournalInput {
  date: Date;
  memo?: string | null;
  lines: DraftLine[];
  source?: string;
  sourceId?: string | null;
  post?: boolean; // post immediately (requires balanced)
  /** Accrual: reverse this entry automatically on the given date. */
  autoReverseOn?: string | null;
  /** Set on the reversal itself, pointing back at what it reverses. */
  reversesEntryId?: string | null;
}

export type CreateResult = { ok: true; id: string; entryNumber: string } | { ok: false; error: string };

/** Create a journal entry (draft, or posted when `post` and balanced). */
export async function createJournal(input: CreateJournalInput, userId: string): Promise<CreateResult> {
  const lines = cleanLines(input.lines);
  if (lines.length < 2) return { ok: false, error: "A journal entry needs at least two lines." };
  const t = totals(lines);
  if (input.post && !t.balanced) return { ok: false, error: `Debits (${t.debit.toFixed(2)}) must equal credits (${t.credit.toFixed(2)}).` };
  const guard = await postingGuard(input.date);
  if (input.post && guard.error) return { ok: false, error: guard.error };

  // Guard against inactive/unknown accounts, and pick up each account's default
  // segment so every posting is analysable even when the caller didn't set one.
  const ids = Array.from(new Set(lines.map((l) => l.accountId)));
  const accts = await db.select({ id: glAccounts.id, active: glAccounts.active, segmentId: glAccounts.segmentId }).from(glAccounts).where(inArray(glAccounts.id, ids));
  if (accts.length !== ids.length || accts.some((a) => !a.active)) return { ok: false, error: "One or more lines reference an unknown or disabled account." };
  const defaultSegment = new Map(accts.map((a) => [a.id, a.segmentId]));

  return db.transaction(async (tx) => {
    const entryNumber = await nextJournalNumber(tx as unknown as typeof db);
    const [entry] = await tx.insert(journalEntries).values({
      entryNumber,
      date: input.date,
      memo: input.memo ?? null,
      status: input.post ? "posted" : "draft",
      source: input.source ?? "manual",
      sourceId: input.sourceId ?? null,
      periodId: guard.periodId,
      autoReverseOn: input.autoReverseOn ?? null,
      reversesEntryId: input.reversesEntryId ?? null,
      postedAt: input.post ? new Date() : null,
      postedBy: input.post ? userId : null,
      createdBy: userId,
    }).returning({ id: journalEntries.id });
    await tx.insert(journalLines).values(lines.map((l, i) => ({
      entryId: entry.id,
      accountId: l.accountId,
      debit: l.debit.toFixed(2),
      credit: l.credit.toFixed(2),
      memo: l.memo ?? null,
      bpId: l.bpId ?? null,
      segmentId: l.segmentId ?? defaultSegment.get(l.accountId) ?? null,
      sortOrder: i,
    })));
    return { ok: true as const, id: entry.id, entryNumber };
  });
}

/** Post a balanced draft. */
export async function postJournal(id: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  const entry = await db.query.journalEntries.findFirst({ where: eq(journalEntries.id, id) });
  if (!entry) return { ok: false, error: "Entry not found." };
  if (entry.status !== "draft") return { ok: false, error: "Only draft entries can be posted." };
  const guard = await postingGuard(entry.date);
  if (guard.error) return { ok: false, error: guard.error };
  const lines = await db.select().from(journalLines).where(eq(journalLines.entryId, id));
  const t = totals(lines.map((l) => ({ accountId: l.accountId, debit: Number(l.debit), credit: Number(l.credit) })));
  if (!t.balanced) return { ok: false, error: "Entry is not balanced." };
  await db.update(journalEntries).set({ status: "posted", postedAt: new Date(), postedBy: userId, periodId: guard.periodId ?? entry.periodId, updatedAt: new Date() }).where(eq(journalEntries.id, id));
  return { ok: true };
}

/** Void a posted entry (kept on record; excluded from balances). */
export async function voidJournal(id: string, userId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const entry = await db.query.journalEntries.findFirst({ where: eq(journalEntries.id, id) });
  if (!entry) return { ok: false, error: "Entry not found." };
  if (entry.status === "void") return { ok: true };
  const vGuard = await postingGuard(entry.date);
  if (vGuard.error) return { ok: false, error: vGuard.error.replace("Post to", "Voiding needs an open period. Post to") };
  await db.update(journalEntries).set({ status: "void", voidedAt: new Date(), voidReason: reason || "Voided", postedBy: entry.postedBy ?? userId, updatedAt: new Date() }).where(eq(journalEntries.id, id));
  return { ok: true };
}

export interface TrialBalanceRow {
  id: string;
  code: string;
  name: string;
  type: GlAccountType;
  subtype: string | null;
  naturalCode?: string | null;
  segmentId?: string | null;
  debit: number; // total debits posted
  credit: number; // total credits posted
  balance: number; // signed on the account's normal side
}

/** Per-account debit/credit totals and normal-side balance from POSTED entries
 *  within an optional date range. Basis for the trial balance & statements.
 *
 *  `segmentId` narrows to one account-code segment (a product line or a
 *  department) — the slice management actually reads the P&L by. */
export async function accountTotals(opts: { from?: Date; to?: Date; segmentId?: string } = {}): Promise<TrialBalanceRow[]> {
  const conds = [eq(journalEntries.status, "posted")];
  if (opts.from) conds.push(sql`${journalEntries.date} >= ${opts.from}`);
  if (opts.to) conds.push(sql`${journalEntries.date} <= ${opts.to}`);
  // The segment filter belongs on the line join, not the entry join, so that
  // accounts with no matching lines still come back at zero.
  const lineJoin = opts.segmentId
    ? and(eq(journalLines.accountId, glAccounts.id), eq(journalLines.segmentId, opts.segmentId))
    : eq(journalLines.accountId, glAccounts.id);

  const rows = await db
    .select({
      id: glAccounts.id, code: glAccounts.code, name: glAccounts.name, type: glAccounts.type, subtype: glAccounts.subtype,
      naturalCode: glAccounts.naturalCode, segmentId: glAccounts.segmentId,
      debit: sql<string>`COALESCE(SUM(${journalLines.debit}), 0)`,
      credit: sql<string>`COALESCE(SUM(${journalLines.credit}), 0)`,
    })
    .from(glAccounts)
    .leftJoin(journalLines, lineJoin)
    .leftJoin(journalEntries, and(eq(journalEntries.id, journalLines.entryId), ...conds))
    .groupBy(glAccounts.id)
    .orderBy(asc(glAccounts.code));

  return rows.map((r) => {
    const debit = Number(r.debit), credit = Number(r.credit);
    return { id: r.id, code: r.code, name: r.name, type: r.type, subtype: r.subtype, naturalCode: r.naturalCode, segmentId: r.segmentId, debit, credit, balance: accountBalance(r.type, debit, credit) };
  });
}

export interface SegmentTotalsRow {
  segmentId: string | null;
  segmentCode: string;
  segmentName: string;
  segmentShort: string;
  kind: string;
  type: GlAccountType;
  subtype: string | null;
  debit: number;
  credit: number;
  balance: number;
}

/** Posted totals grouped by SEGMENT and account type — the raw material for a
 *  P&L matrix with one column per product line / department. */
export async function segmentTotals(opts: { from?: Date; to?: Date } = {}): Promise<SegmentTotalsRow[]> {
  const conds = [eq(journalEntries.status, "posted")];
  if (opts.from) conds.push(sql`${journalEntries.date} >= ${opts.from}`);
  if (opts.to) conds.push(sql`${journalEntries.date} <= ${opts.to}`);

  const rows = await db
    .select({
      segmentId: glSegments.id,
      segmentCode: glSegments.code,
      segmentName: glSegments.name,
      segmentShort: glSegments.shortName,
      kind: glSegments.kind,
      type: glAccounts.type,
      subtype: glAccounts.subtype,
      debit: sql<string>`COALESCE(SUM(${journalLines.debit}), 0)`,
      credit: sql<string>`COALESCE(SUM(${journalLines.credit}), 0)`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, and(eq(journalEntries.id, journalLines.entryId), ...conds))
    .innerJoin(glAccounts, eq(glAccounts.id, journalLines.accountId))
    .leftJoin(glSegments, eq(glSegments.id, journalLines.segmentId))
    .groupBy(glSegments.id, glSegments.code, glSegments.name, glSegments.shortName, glSegments.kind, glAccounts.type, glAccounts.subtype);

  return rows.map((r) => {
    const debit = Number(r.debit), credit = Number(r.credit);
    return {
      segmentId: r.segmentId,
      segmentCode: r.segmentCode ?? "000",
      segmentName: r.segmentName ?? "Unsegmented",
      segmentShort: r.segmentShort ?? "",
      kind: r.kind ?? "none",
      type: r.type,
      subtype: r.subtype,
      debit,
      credit,
      balance: accountBalance(r.type, debit, credit),
    };
  });
}

/** Trial balance: cumulative account balances up to an optional as-of date. */
export function trialBalance(opts: { asOf?: Date } = {}): Promise<TrialBalanceRow[]> {
  return accountTotals({ to: opts.asOf });
}

/** Posted journal lines for one account, oldest first, with a running balance. */
export async function accountLedger(accountId: string): Promise<{
  account: { id: string; code: string; name: string; type: GlAccountType } | null;
  rows: { entryId: string; entryNumber: string; date: Date; memo: string | null; debit: number; credit: number; running: number }[];
}> {
  const account = await db.query.glAccounts.findFirst({ where: eq(glAccounts.id, accountId), columns: { id: true, code: true, name: true, type: true } });
  if (!account) return { account: null, rows: [] };
  const lines = await db
    .select({ entryId: journalEntries.id, entryNumber: journalEntries.entryNumber, date: journalEntries.date, memo: journalLines.memo, entryMemo: journalEntries.memo, debit: journalLines.debit, credit: journalLines.credit })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(and(eq(journalLines.accountId, accountId), eq(journalEntries.status, "posted")))
    .orderBy(asc(journalEntries.date), asc(journalEntries.entryNumber));

  let running = 0;
  const rows = lines.map((l) => {
    const debit = Number(l.debit), credit = Number(l.credit);
    running = round2(running + accountBalance(account.type, debit, credit));
    return { entryId: l.entryId, entryNumber: l.entryNumber, date: l.date, memo: l.memo ?? l.entryMemo, debit, credit, running };
  });
  return { account, rows };
}

/** Recent journal entries with their debit total (for the list page). */
export async function listJournals(limit = 100): Promise<{ id: string; entryNumber: string; date: Date; memo: string | null; status: string; source: string; amount: number }[]> {
  const rows = await db
    .select({ id: journalEntries.id, entryNumber: journalEntries.entryNumber, date: journalEntries.date, memo: journalEntries.memo, status: journalEntries.status, source: journalEntries.source, amount: sql<string>`COALESCE(SUM(${journalLines.debit}), 0)` })
    .from(journalEntries)
    .leftJoin(journalLines, eq(journalLines.entryId, journalEntries.id))
    .groupBy(journalEntries.id)
    .orderBy(desc(journalEntries.date), desc(journalEntries.entryNumber))
    .limit(limit);
  return rows.map((r) => ({ ...r, amount: Number(r.amount) }));
}

/** Reverse a posted entry: create and post its mirror image on `date`.
 *  This is how month-end accruals unwind — the accrual is posted on the last
 *  day of the period and its reversal on the first day of the next. */
export async function reverseJournal(
  id: string,
  date: Date,
  userId: string,
  memo?: string,
): Promise<CreateResult> {
  const entry = await db.query.journalEntries.findFirst({ where: eq(journalEntries.id, id) });
  if (!entry) return { ok: false, error: "Entry not found." };
  if (entry.status !== "posted") return { ok: false, error: "Only posted entries can be reversed." };

  const existing = await db.query.journalEntries.findFirst({
    where: and(eq(journalEntries.reversesEntryId, id), ne(journalEntries.status, "void")),
    columns: { id: true, entryNumber: true },
  });
  if (existing) return { ok: true, id: existing.id, entryNumber: existing.entryNumber };

  const lines = await db.select().from(journalLines).where(eq(journalLines.entryId, id));
  return createJournal(
    {
      date,
      memo: memo ?? `Reversal of ${entry.entryNumber}${entry.memo ? ` — ${entry.memo}` : ""}`,
      // Swap debits and credits, keeping the analytics.
      lines: lines.map((l) => ({
        accountId: l.accountId,
        debit: Number(l.credit),
        credit: Number(l.debit),
        memo: l.memo,
        bpId: l.bpId,
        segmentId: l.segmentId,
      })),
      source: "reversal",
      sourceId: id,
      reversesEntryId: id,
      post: true,
    },
    userId,
  );
}

/** Post the reversals that come due on or before `asOf` — the accrual unwind.
 *  Idempotent: an accrual that already has a live reversal is skipped. */
export async function runDueReversals(asOf: Date, userId: string): Promise<{ reversed: number }> {
  const day = asOf.toISOString().slice(0, 10);
  const due = await db
    .select({ id: journalEntries.id, on: journalEntries.autoReverseOn })
    .from(journalEntries)
    .where(and(eq(journalEntries.status, "posted"), lte(journalEntries.autoReverseOn, day)));

  let reversed = 0;
  for (const e of due) {
    const already = await db.query.journalEntries.findFirst({
      where: and(eq(journalEntries.reversesEntryId, e.id), ne(journalEntries.status, "void")),
      columns: { id: true },
    });
    if (already) continue;
    const res = await reverseJournal(e.id, new Date(`${e.on}T00:00:00`), userId);
    if (res.ok) reversed++;
  }
  return { reversed };
}
