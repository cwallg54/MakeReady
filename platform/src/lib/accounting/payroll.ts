import "server-only";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  glAccounts,
  glSegments,
  numberSeries,
  payrollRunLines,
  payrollRuns,
  payrollTemplateLines,
  payrollTemplates,
} from "@/db/schema";
import { createJournal, voidJournal, type DraftLine } from "./journal";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The order the entry screen groups lines in — how a payroll report reads. */
export const PAYROLL_GROUPS = ["Wages", "Overtime", "Bonuses", "Taxes", "Benefits", "Payable"] as const;
export type PayrollGroup = (typeof PAYROLL_GROUPS)[number];

async function nextRunNumber(): Promise<string> {
  let s = await db.query.numberSeries.findFirst({ where: eq(numberSeries.documentType, "payroll_run") });
  if (!s) [s] = await db.insert(numberSeries).values({ documentType: "payroll_run", prefix: "PAY-", nextNumber: 1, padding: 5 }).returning();
  const n = s.nextNumber;
  await db.update(numberSeries).set({ nextNumber: n + 1, updatedAt: new Date() }).where(eq(numberSeries.id, s.id));
  return `${s.prefix}${String(n).padStart(s.padding, "0")}`;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export async function listTemplates() {
  const rows = await db
    .select({
      id: payrollTemplates.id,
      name: payrollTemplates.name,
      description: payrollTemplates.description,
      active: payrollTemplates.active,
      lines: sql<string>`(SELECT COUNT(*) FROM payroll_template_lines l WHERE l.template_id = "payroll_templates"."id")`,
    })
    .from(payrollTemplates)
    .orderBy(asc(payrollTemplates.name));
  return rows.map((r) => ({ ...r, lines: Number(r.lines) }));
}

export async function templateLines(templateId: string) {
  return db
    .select({
      id: payrollTemplateLines.id,
      accountId: payrollTemplateLines.accountId,
      label: payrollTemplateLines.label,
      side: payrollTemplateLines.side,
      grouping: payrollTemplateLines.grouping,
      sortOrder: payrollTemplateLines.sortOrder,
      accountCode: glAccounts.code,
      accountName: glAccounts.name,
      segment: glSegments.shortName,
    })
    .from(payrollTemplateLines)
    .innerJoin(glAccounts, eq(glAccounts.id, payrollTemplateLines.accountId))
    .leftJoin(glSegments, eq(glSegments.id, glAccounts.segmentId))
    .where(eq(payrollTemplateLines.templateId, templateId))
    .orderBy(asc(payrollTemplateLines.sortOrder));
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export interface NewRunInput {
  templateId: string;
  kind: "payroll" | "accrual";
  payDate: string; // YYYY-MM-DD — the cheque date
  periodStart?: string | null;
  periodEnd?: string | null;
  /** Accruals post on this date (the month end) and reverse on the pay date. */
  accrualDate?: string | null;
  notes?: string | null;
  /** Seed the amounts from the last posted payroll run. */
  copyLast?: boolean;
}

export type RunResult = { ok: true; id: string; runNumber: string } | { ok: false; error: string };

/** Start a run from a template. Amounts come in blank, or pre-filled from the
 *  last posted payroll — which is what saves the typing, because payroll
 *  changes by a few hundred dollars a period, not by its shape. */
export async function createPayrollRun(input: NewRunInput, userId: string): Promise<RunResult> {
  const template = await db.query.payrollTemplates.findFirst({ where: eq(payrollTemplates.id, input.templateId) });
  if (!template) return { ok: false, error: "Template not found." };

  const lines = await db
    .select()
    .from(payrollTemplateLines)
    .where(eq(payrollTemplateLines.templateId, input.templateId))
    .orderBy(asc(payrollTemplateLines.sortOrder));
  if (!lines.length) return { ok: false, error: "That template has no lines yet." };

  let previous = new Map<string, number>();
  if (input.copyLast) {
    // Always seed from the last posted PAYROLL, whichever kind is being
    // created: an accrual is an estimate of the payroll it anticipates, so the
    // payroll is what it should mirror.
    const last = await db.query.payrollRuns.findFirst({
      where: and(eq(payrollRuns.templateId, input.templateId), eq(payrollRuns.kind, "payroll"), eq(payrollRuns.status, "posted")),
      orderBy: [desc(payrollRuns.payDate)],
      columns: { id: true },
    });
    if (last) {
      const rows = await db.select({ accountId: payrollRunLines.accountId, label: payrollRunLines.label, amount: payrollRunLines.amount }).from(payrollRunLines).where(eq(payrollRunLines.runId, last.id));
      previous = new Map(rows.map((r) => [`${r.accountId}|${r.label}`, Number(r.amount)]));
    }
  }

  const runNumber = await nextRunNumber();
  const [run] = await db
    .insert(payrollRuns)
    .values({
      runNumber,
      templateId: input.templateId,
      kind: input.kind,
      payDate: input.payDate,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
      accrualDate: input.kind === "accrual" ? input.accrualDate ?? null : null,
      status: "draft",
      notes: input.notes ?? null,
      createdBy: userId,
    })
    .returning({ id: payrollRuns.id });

  await db.insert(payrollRunLines).values(
    lines.map((l) => ({
      runId: run.id,
      accountId: l.accountId,
      label: l.label,
      side: l.side,
      grouping: l.grouping,
      amount: (previous.get(`${l.accountId}|${l.label}`) ?? 0).toFixed(2),
      sortOrder: l.sortOrder,
    })),
  );

  return { ok: true, id: run.id, runNumber };
}

export async function runDetail(runId: string) {
  const run = await db.query.payrollRuns.findFirst({ where: eq(payrollRuns.id, runId) });
  if (!run) return null;
  const lines = await db
    .select({
      id: payrollRunLines.id,
      accountId: payrollRunLines.accountId,
      label: payrollRunLines.label,
      side: payrollRunLines.side,
      grouping: payrollRunLines.grouping,
      amount: payrollRunLines.amount,
      sortOrder: payrollRunLines.sortOrder,
      accountCode: glAccounts.code,
      accountName: glAccounts.name,
      segment: glSegments.shortName,
    })
    .from(payrollRunLines)
    .innerJoin(glAccounts, eq(glAccounts.id, payrollRunLines.accountId))
    .leftJoin(glSegments, eq(glSegments.id, glAccounts.segmentId))
    .where(eq(payrollRunLines.runId, runId))
    .orderBy(asc(payrollRunLines.sortOrder));

  const mapped = lines.map((l) => ({ ...l, amount: Number(l.amount) }));
  const debits = round2(mapped.filter((l) => l.side === "debit").reduce((s, l) => s + l.amount, 0));
  const credits = round2(mapped.filter((l) => l.side === "credit").reduce((s, l) => s + l.amount, 0));
  return { run, lines: mapped, debits, credits, balanced: Math.abs(debits - credits) < 0.005 && debits > 0 };
}

/** Save the typed amounts on a draft run. */
export async function savePayrollAmounts(runId: string, amounts: Record<string, number>): Promise<{ ok: boolean; error?: string }> {
  const run = await db.query.payrollRuns.findFirst({ where: eq(payrollRuns.id, runId), columns: { status: true } });
  if (!run) return { ok: false, error: "Run not found." };
  if (run.status !== "draft") return { ok: false, error: "Only a draft run can be edited." };

  for (const [lineId, value] of Object.entries(amounts)) {
    const amount = round2(Math.max(0, Number(value) || 0));
    await db.update(payrollRunLines).set({ amount: amount.toFixed(2) }).where(eq(payrollRunLines.id, lineId));
  }
  const detail = await runDetail(runId);
  await db
    .update(payrollRuns)
    .set({ total: (detail?.debits ?? 0).toFixed(2), updatedAt: new Date() })
    .where(eq(payrollRuns.id, runId));
  return { ok: true };
}

/** Post the run to the GL.
 *
 *  A payroll run posts on the pay date. An accrual posts on the accrual date
 *  (the month end) and carries an auto-reverse date of the pay date, so the
 *  close unwinds it automatically instead of someone remembering to. */
export async function postPayrollRun(runId: string, userId: string): Promise<{ ok: boolean; error?: string; entryNumber?: string }> {
  const detail = await runDetail(runId);
  if (!detail) return { ok: false, error: "Run not found." };
  const { run, lines, debits, credits, balanced } = detail;
  if (run.status !== "draft") return { ok: false, error: "Only a draft run can be posted." };
  if (!balanced) {
    return { ok: false, error: `Debits ${debits.toFixed(2)} don't equal credits ${credits.toFixed(2)}. The difference is ${Math.abs(debits - credits).toFixed(2)}.` };
  }

  const isAccrual = run.kind === "accrual";
  const postDate = new Date(`${isAccrual ? run.accrualDate ?? run.payDate : run.payDate}T12:00:00`);
  const memo = isAccrual
    ? `Accrued payroll for ${run.payDate}`
    : `Payroll ${run.payDate}${run.periodStart && run.periodEnd ? ` (${run.periodStart} – ${run.periodEnd})` : ""}`;

  const draft: DraftLine[] = lines
    .filter((l) => l.amount > 0)
    .map((l) => ({
      accountId: l.accountId,
      debit: l.side === "debit" ? l.amount : 0,
      credit: l.side === "credit" ? l.amount : 0,
      memo: l.label,
    }));

  const res = await createJournal(
    {
      date: postDate,
      memo,
      lines: draft,
      source: isAccrual ? "payroll_accrual" : "payroll",
      sourceId: runId,
      // The accrual unwinds on the day the money actually goes out.
      autoReverseOn: isAccrual ? run.payDate : null,
      post: true,
    },
    userId,
  );
  if (!res.ok) return { ok: false, error: res.error };

  const entry = await db.query.journalEntries.findFirst({
    where: (j, { eq: e }) => e(j.entryNumber, res.entryNumber),
    columns: { id: true },
  });

  await db
    .update(payrollRuns)
    .set({ status: "posted", postedAt: new Date(), postedBy: userId, journalEntryId: entry?.id ?? null, total: debits.toFixed(2), updatedAt: new Date() })
    .where(eq(payrollRuns.id, runId));

  return { ok: true, entryNumber: res.entryNumber };
}

export async function voidPayrollRun(runId: string, userId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const run = await db.query.payrollRuns.findFirst({ where: eq(payrollRuns.id, runId) });
  if (!run) return { ok: false, error: "Run not found." };
  if (run.status === "void") return { ok: true };
  if (run.journalEntryId) {
    const res = await voidJournal(run.journalEntryId, userId, reason || `Payroll ${run.runNumber} voided`);
    if (!res.ok) return res;
  }
  await db.update(payrollRuns).set({ status: "void", notes: reason || run.notes, updatedAt: new Date() }).where(eq(payrollRuns.id, runId));
  return { ok: true };
}

export async function listRuns(limit = 40) {
  const rows = await db
    .select({
      id: payrollRuns.id,
      runNumber: payrollRuns.runNumber,
      kind: payrollRuns.kind,
      payDate: payrollRuns.payDate,
      accrualDate: payrollRuns.accrualDate,
      status: payrollRuns.status,
      total: payrollRuns.total,
      template: payrollTemplates.name,
    })
    .from(payrollRuns)
    .leftJoin(payrollTemplates, eq(payrollTemplates.id, payrollRuns.templateId))
    .orderBy(desc(payrollRuns.payDate), desc(payrollRuns.runNumber))
    .limit(limit);
  return rows.map((r) => ({ ...r, total: Number(r.total) }));
}

/** Payroll cost by department segment over a period — what the wage split is
 *  actually for. Reads the posted runs rather than the GL, so it stays keyed to
 *  the payroll lines. */
export async function payrollBySegment(from: string, to: string) {
  const rows = await db
    .select({
      segment: sql<string>`COALESCE(${glSegments.shortName}, 'Unsegmented')`,
      grouping: payrollRunLines.grouping,
      amount: sql<string>`COALESCE(SUM(${payrollRunLines.amount}), 0)`,
    })
    .from(payrollRunLines)
    .innerJoin(payrollRuns, eq(payrollRuns.id, payrollRunLines.runId))
    .innerJoin(glAccounts, eq(glAccounts.id, payrollRunLines.accountId))
    .leftJoin(glSegments, eq(glSegments.id, glAccounts.segmentId))
    .where(
      and(
        eq(payrollRuns.status, "posted"),
        ne(payrollRuns.kind, "accrual"),
        sql`${payrollRuns.payDate} >= ${from}`,
        sql`${payrollRuns.payDate} <= ${to}`,
        eq(payrollRunLines.side, "debit"),
      ),
    )
    .groupBy(glSegments.shortName, payrollRunLines.grouping);

  return rows.map((r) => ({ segment: r.segment, grouping: r.grouping ?? "Other", amount: round2(Number(r.amount)) }));
}
