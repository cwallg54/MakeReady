/** Fiscal calendar.
 *
 *  The business runs an **October–September** fiscal year, labelled by the
 *  calendar year it ends in: FY2026 = 1 Oct 2025 → 30 Sep 2026. Periods are
 *  numbered 1–12 from October (`2026-01` is October 2025), and quarters follow:
 *  Q1 Oct–Dec, Q2 Jan–Mar, Q3 Apr–Jun, Q4 Jul–Sep.
 *
 *  The start month is configurable (`system_settings.fiscal_year_start_month`)
 *  so the platform still works for a January-start company — everything here
 *  takes the start month as an argument rather than hard-coding 10.
 *
 *  Pure date maths only; no DB access. See `fiscal-service.ts` for the queries.
 */

export const DEFAULT_FISCAL_START_MONTH = 10; // October

export interface PeriodSpec {
  code: string; // "2026-01"
  name: string; // "Oct 2025"
  periodNumber: number; // 1-12 from the fiscal start month
  quarter: number; // 1-4
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

export interface YearSpec {
  year: number;
  startDate: string;
  endDate: string;
  periods: PeriodSpec[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** The fiscal year a calendar date falls in, labelled by its ending year.
 *  With an October start, 2025-10-01 → FY2026 and 2025-09-30 → FY2025. */
export function fiscalYearOf(date: Date | string, startMonth = DEFAULT_FISCAL_START_MONTH): number {
  const d = typeof date === "string" ? new Date(`${date.slice(0, 10)}T00:00:00Z`) : date;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  if (startMonth === 1) return y;
  return m >= startMonth ? y + 1 : y;
}

/** 1-based period number within the fiscal year (1 = the start month). */
export function periodNumberOf(date: Date | string, startMonth = DEFAULT_FISCAL_START_MONTH): number {
  const d = typeof date === "string" ? new Date(`${date.slice(0, 10)}T00:00:00Z`) : date;
  const m = d.getUTCMonth() + 1;
  return ((m - startMonth + 12) % 12) + 1;
}

/** Fiscal quarter (1-4) for a period number. */
export const quarterOfPeriod = (periodNumber: number) => Math.floor((periodNumber - 1) / 3) + 1;

/** Period code for a date, e.g. "2026-01". */
export function periodCodeOf(date: Date | string, startMonth = DEFAULT_FISCAL_START_MONTH): string {
  return `${fiscalYearOf(date, startMonth)}-${pad(periodNumberOf(date, startMonth))}`;
}

/** Build the full 12-period definition of a fiscal year. */
export function buildFiscalYear(year: number, startMonth = DEFAULT_FISCAL_START_MONTH): YearSpec {
  // With a non-January start the year *begins* in the previous calendar year.
  const startCalendarYear = startMonth === 1 ? year : year - 1;
  const periods: PeriodSpec[] = [];

  for (let i = 0; i < 12; i++) {
    const monthIndex = startMonth - 1 + i; // 0-based, may exceed 11
    const y = startCalendarYear + Math.floor(monthIndex / 12);
    const m = (monthIndex % 12) + 1;
    const periodNumber = i + 1;
    periods.push({
      code: `${year}-${pad(periodNumber)}`,
      name: `${MONTHS[m - 1]} ${y}`,
      periodNumber,
      quarter: quarterOfPeriod(periodNumber),
      startDate: iso(y, m, 1),
      endDate: iso(y, m, lastDayOfMonth(y, m)),
    });
  }

  return {
    year,
    startDate: periods[0].startDate,
    endDate: periods[11].endDate,
    periods,
  };
}

/** Inclusive date range of a fiscal quarter. */
export function quarterRange(year: number, quarter: number, startMonth = DEFAULT_FISCAL_START_MONTH) {
  const fy = buildFiscalYear(year, startMonth);
  const inQ = fy.periods.filter((p) => p.quarter === quarter);
  return { startDate: inQ[0].startDate, endDate: inQ[inQ.length - 1].endDate, periods: inQ };
}

/** Year-to-date range: fiscal-year start through the end of `asOf`'s period. */
export function ytdRange(asOf: Date | string, startMonth = DEFAULT_FISCAL_START_MONTH) {
  const year = fiscalYearOf(asOf, startMonth);
  const fy = buildFiscalYear(year, startMonth);
  const pn = periodNumberOf(asOf, startMonth);
  return { year, startDate: fy.startDate, endDate: fy.periods[pn - 1].endDate, throughPeriod: pn };
}

/** The same period one fiscal year earlier — the comparative every report needs. */
export function priorYearPeriod(code: string): string {
  const [y, n] = code.split("-");
  return `${Number(y) - 1}-${n}`;
}

/** Label a fiscal year the way finance says it out loud. */
export function fiscalYearLabel(year: number, startMonth = DEFAULT_FISCAL_START_MONTH): string {
  if (startMonth === 1) return `FY${year}`;
  const fy = buildFiscalYear(year, startMonth);
  const s = new Date(`${fy.startDate}T00:00:00Z`);
  const e = new Date(`${fy.endDate}T00:00:00Z`);
  return `FY${year} (${MONTHS[s.getUTCMonth()]} ${s.getUTCFullYear()} – ${MONTHS[e.getUTCMonth()]} ${e.getUTCFullYear()})`;
}

/** ISO week (Mon–Sun) containing `date`, as YYYY-MM-DD bounds. Weekly flash
 *  reporting runs on calendar weeks, not fiscal periods. */
export function weekRange(date: Date | string): { startDate: string; endDate: string } {
  const d = typeof date === "string" ? new Date(`${date.slice(0, 10)}T00:00:00Z`) : new Date(date);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  const start = new Date(d);
  start.setUTCDate(d.getUTCDate() - day);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}
