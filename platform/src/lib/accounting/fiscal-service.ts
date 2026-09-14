import "server-only";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { fiscalPeriods, fiscalYears, systemSettings } from "@/db/schema";
import {
  DEFAULT_FISCAL_START_MONTH,
  buildFiscalYear,
  fiscalYearOf,
  type PeriodSpec,
} from "./fiscal";

export type FiscalStatus = "open" | "closing" | "locked";

const ymd = (d: Date | string) =>
  typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);

/** The configured fiscal-year start month (10 = October for GMW). */
export async function fiscalStartMonth(): Promise<number> {
  const s = await db.query.systemSettings.findFirst({ columns: { fiscalYearStartMonth: true } });
  const m = s?.fiscalYearStartMonth ?? DEFAULT_FISCAL_START_MONTH;
  return m >= 1 && m <= 12 ? m : DEFAULT_FISCAL_START_MONTH;
}

/** Create a fiscal year and its 12 periods if they don't exist yet. Idempotent,
 *  so it is safe to call lazily whenever a date needs a period. */
export async function ensureFiscalYear(year: number): Promise<string> {
  const existing = await db.query.fiscalYears.findFirst({ where: eq(fiscalYears.year, year), columns: { id: true } });
  if (existing) return existing.id;

  const spec = buildFiscalYear(year, await fiscalStartMonth());
  const [row] = await db
    .insert(fiscalYears)
    .values({ year, startDate: spec.startDate, endDate: spec.endDate, status: "open" })
    .onConflictDoNothing({ target: fiscalYears.year })
    .returning({ id: fiscalYears.id });

  const yearId =
    row?.id ??
    (await db.query.fiscalYears.findFirst({ where: eq(fiscalYears.year, year), columns: { id: true } }))!.id;

  await db
    .insert(fiscalPeriods)
    .values(
      spec.periods.map((p: PeriodSpec) => ({
        fiscalYearId: yearId,
        code: p.code,
        name: p.name,
        periodNumber: p.periodNumber,
        quarter: p.quarter,
        startDate: p.startDate,
        endDate: p.endDate,
        status: "open" as const,
      })),
    )
    .onConflictDoNothing({ target: fiscalPeriods.code });

  return yearId;
}

/** Make sure a span of fiscal years exists — used to seed the calendar ahead. */
export async function ensureFiscalYears(from: number, to: number): Promise<void> {
  for (let y = from; y <= to; y++) await ensureFiscalYear(y);
}

export type PeriodRow = typeof fiscalPeriods.$inferSelect;

/** The period a date falls in, creating its fiscal year on demand. */
export async function periodForDate(date: Date | string): Promise<PeriodRow | null> {
  const day = ymd(date);
  const find = () =>
    db.query.fiscalPeriods.findFirst({
      where: and(lte(fiscalPeriods.startDate, day), gte(fiscalPeriods.endDate, day)),
    });

  const hit = await find();
  if (hit) return hit;

  await ensureFiscalYear(fiscalYearOf(day, await fiscalStartMonth()));
  return (await find()) ?? null;
}

/** Whether the books are closed for a date.
 *
 *  `locked` blocks all posting. `closing` allows posting (adjustments during
 *  the close) but the UI warns. An unknown date is treated as open — the
 *  calendar auto-extends rather than blocking work. */
export async function periodLock(
  date: Date | string,
): Promise<{ status: FiscalStatus; period: PeriodRow | null; blocked: boolean }> {
  const period = await periodForDate(date);
  const status = (period?.status ?? "open") as FiscalStatus;
  return { status, period, blocked: status === "locked" };
}

export async function listFiscalYears(): Promise<(typeof fiscalYears.$inferSelect)[]> {
  return db.select().from(fiscalYears).orderBy(desc(fiscalYears.year));
}

export async function listPeriods(year: number): Promise<PeriodRow[]> {
  const fy = await db.query.fiscalYears.findFirst({ where: eq(fiscalYears.year, year), columns: { id: true } });
  if (!fy) return [];
  return db
    .select()
    .from(fiscalPeriods)
    .where(eq(fiscalPeriods.fiscalYearId, fy.id))
    .orderBy(asc(fiscalPeriods.periodNumber));
}

/** The period containing today — what the dashboard and close screen default to. */
export async function currentPeriod(): Promise<PeriodRow | null> {
  return periodForDate(new Date());
}

/** Set a period's status. Locking a period also stamps who/when. */
export async function setPeriodStatus(periodId: string, status: FiscalStatus, userId: string): Promise<void> {
  await db
    .update(fiscalPeriods)
    .set({
      status,
      closedAt: status === "locked" ? new Date() : null,
      closedBy: status === "locked" ? userId : null,
    })
    .where(eq(fiscalPeriods.id, periodId));
}

/** Lock or reopen a whole fiscal year (and every period in it). */
export async function setYearStatus(yearId: string, status: FiscalStatus, userId: string): Promise<void> {
  await db
    .update(fiscalYears)
    .set({
      status,
      closedAt: status === "locked" ? new Date() : null,
      closedBy: status === "locked" ? userId : null,
    })
    .where(eq(fiscalYears.id, yearId));
  await db
    .update(fiscalPeriods)
    .set({
      status,
      closedAt: status === "locked" ? new Date() : null,
      closedBy: status === "locked" ? userId : null,
    })
    .where(eq(fiscalPeriods.fiscalYearId, yearId));
}

/** Periods for a fiscal year with the posted totals that drive the close
 *  checklist. Returned oldest-first. */
export async function periodsWithRange(year: number): Promise<PeriodRow[]> {
  await ensureFiscalYear(year);
  return listPeriods(year);
}
