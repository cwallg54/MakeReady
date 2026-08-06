import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { journalEntries, journalLines, glAccounts, numberSeries } from "@/db/schema";
import { accountBalance, type GlAccountType } from "./gl";

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface DraftLine {
  accountId: string;
  debit: number;
  credit: number;
  memo?: string | null;
}

/** Keep only real lines (an account and a non-zero debit or credit), and
 *  normalise so each line is purely a debit or purely a credit. */
export function cleanLines(lines: DraftLine[]): DraftLine[] {
  return lines
    .map((l) => ({ accountId: l.accountId, debit: round2(Math.max(0, Number(l.debit) || 0)), credit: round2(Math.max(0, Number(l.credit) || 0)), memo: l.memo ?? null }))
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
}

export type CreateResult = { ok: true; id: string; entryNumber: string } | { ok: false; error: string };

/** Create a journal entry (draft, or posted when `post` and balanced). */
export async function createJournal(input: CreateJournalInput, userId: string): Promise<CreateResult> {
  const lines = cleanLines(input.lines);
  if (lines.length < 2) return { ok: false, error: "A journal entry needs at least two lines." };
  const t = totals(lines);
  if (input.post && !t.balanced) return { ok: false, error: `Debits (${t.debit.toFixed(2)}) must equal credits (${t.credit.toFixed(2)}).` };

  // Guard against inactive/unknown accounts.
  const ids = Array.from(new Set(lines.map((l) => l.accountId)));
  const accts = await db.select({ id: glAccounts.id, active: glAccounts.active }).from(glAccounts).where(inArray(glAccounts.id, ids));
  if (accts.length !== ids.length || accts.some((a) => !a.active)) return { ok: false, error: "One or more lines reference an unknown or disabled account." };

  return db.transaction(async (tx) => {
    const entryNumber = await nextJournalNumber(tx as unknown as typeof db);
    const [entry] = await tx.insert(journalEntries).values({
      entryNumber,
      date: input.date,
      memo: input.memo ?? null,
      status: input.post ? "posted" : "draft",
      source: input.source ?? "manual",
      sourceId: input.sourceId ?? null,
      postedAt: input.post ? new Date() : null,
      postedBy: input.post ? userId : null,
      createdBy: userId,
    }).returning({ id: journalEntries.id });
    await tx.insert(journalLines).values(lines.map((l, i) => ({ entryId: entry.id, accountId: l.accountId, debit: l.debit.toFixed(2), credit: l.credit.toFixed(2), memo: l.memo ?? null, sortOrder: i })));
    return { ok: true as const, id: entry.id, entryNumber };
  });
}

/** Post a balanced draft. */
export async function postJournal(id: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  const entry = await db.query.journalEntries.findFirst({ where: eq(journalEntries.id, id) });
  if (!entry) return { ok: false, error: "Entry not found." };
  if (entry.status !== "draft") return { ok: false, error: "Only draft entries can be posted." };
  const lines = await db.select().from(journalLines).where(eq(journalLines.entryId, id));
  const t = totals(lines.map((l) => ({ accountId: l.accountId, debit: Number(l.debit), credit: Number(l.credit) })));
  if (!t.balanced) return { ok: false, error: "Entry is not balanced." };
  await db.update(journalEntries).set({ status: "posted", postedAt: new Date(), postedBy: userId, updatedAt: new Date() }).where(eq(journalEntries.id, id));
  return { ok: true };
}

/** Void a posted entry (kept on record; excluded from balances). */
export async function voidJournal(id: string, userId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const entry = await db.query.journalEntries.findFirst({ where: eq(journalEntries.id, id) });
  if (!entry) return { ok: false, error: "Entry not found." };
  if (entry.status === "void") return { ok: true };
  await db.update(journalEntries).set({ status: "void", voidedAt: new Date(), voidReason: reason || "Voided", postedBy: entry.postedBy ?? userId, updatedAt: new Date() }).where(eq(journalEntries.id, id));
  return { ok: true };
}

export interface TrialBalanceRow {
  id: string;
  code: string;
  name: string;
  type: GlAccountType;
  subtype: string | null;
  debit: number; // total debits posted
  credit: number; // total credits posted
  balance: number; // signed on the account's normal side
}

/** Per-account debit/credit totals and normal-side balance from POSTED entries
 *  within an optional date range. Basis for the trial balance & statements. */
export async function accountTotals(opts: { from?: Date; to?: Date } = {}): Promise<TrialBalanceRow[]> {
  const conds = [eq(journalEntries.status, "posted")];
  if (opts.from) conds.push(sql`${journalEntries.date} >= ${opts.from}`);
  if (opts.to) conds.push(sql`${journalEntries.date} <= ${opts.to}`);
  const rows = await db
    .select({
      id: glAccounts.id, code: glAccounts.code, name: glAccounts.name, type: glAccounts.type, subtype: glAccounts.subtype,
      debit: sql<string>`COALESCE(SUM(${journalLines.debit}), 0)`,
      credit: sql<string>`COALESCE(SUM(${journalLines.credit}), 0)`,
    })
    .from(glAccounts)
    .leftJoin(journalLines, eq(journalLines.accountId, glAccounts.id))
    .leftJoin(journalEntries, and(eq(journalEntries.id, journalLines.entryId), ...conds))
    .groupBy(glAccounts.id)
    .orderBy(asc(glAccounts.code));

  return rows.map((r) => {
    const debit = Number(r.debit), credit = Number(r.credit);
    return { id: r.id, code: r.code, name: r.name, type: r.type, subtype: r.subtype, debit, credit, balance: accountBalance(r.type, debit, credit) };
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
