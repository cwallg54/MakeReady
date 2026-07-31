/**
 * Shared metadata + helpers for the "standard" reports — fixed, SAP-parity
 * reports (Sales Analysis, Open Orders, Customer Credit) that are purpose-built
 * pages rather than user-defined column/filter reports (see ./sources.ts).
 *
 * NO database imports here — safe to import from client components.
 */

// Legacy-ERP product / decoration line codes used on sales orders. The label is
// what shows in pickers; the code is stored on orders.order_type.
export const ORDER_TYPES: { code: string; label: string }[] = [
  { code: "SS", label: "Screen Print (SS)" },
  { code: "OSH", label: "Off-Shore (OSH)" },
  { code: "ASI", label: "Ad Specialty (ASI)" },
  { code: "VIN", label: "Vinyl (VIN)" },
  { code: "SOUV", label: "Souvenir (SOUV)" },
  { code: "EMBC", label: "Embroidery — Contract (EMBC)" },
  { code: "EMBF", label: "Embroidery — Finished (EMBF)" },
  { code: "IH", label: "In-House (IH)" },
  { code: "BLASG", label: "Blank Goods (BLASG)" },
];

export const ORDER_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  ORDER_TYPES.map((t) => [t.code, t.label]),
);

// Fulfillment urgency codes stored on orders.date_type.
export const DATE_TYPES = ["ASAP", "FIRM", "DATED", "RUSH", "EVENT"] as const;
export type DateType = (typeof DATE_TYPES)[number];

// Common ship-via options (free text on the order — this is only a picker hint).
export const SHIP_VIA_OPTIONS = [
  "Ground",
  "Ground DS",
  "UPS",
  "Customer UPS Account",
  "3rd Party UPS",
  "FedEx",
  "Will Call",
  "Hand Deliver",
  "GMWS Ground",
  "Ground Collect (FedEx)",
];

// ---- Fiscal calendar (fiscal year runs October → September) ---------------

const TZ = "America/Denver";

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  year: "numeric",
  month: "numeric",
});

/** Year + 0-based calendar month for a date, evaluated in Mountain Time. */
export function ymInDenver(d: Date): { year: number; month0: number } {
  const parts = partsFmt.formatToParts(d);
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month0 = Number(parts.find((p) => p.type === "month")!.value) - 1;
  return { year, month0 };
}

/** Fiscal year label (Oct 2025 → Sep 2026 is fiscal 2026). */
export function fiscalYearOf(d: Date): number {
  const { year, month0 } = ymInDenver(d);
  return month0 >= 9 ? year + 1 : year;
}

/** Position of a date within its fiscal year: Oct = 0 … Sep = 11. */
export function fiscalMonthIndex(d: Date): number {
  const { month0 } = ymInDenver(d);
  return (month0 - 9 + 12) % 12;
}

// Column order for the Sales Analysis pivot (fiscal months, Oct-first).
export const FISCAL_MONTHS = ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"];

/** Whole days from now until `due` (negative = overdue), Mountain Time midnight. */
export function daysUntil(due: Date, now: Date): number {
  const a = ymDayUtcMidnight(due);
  const b = ymDayUtcMidnight(now);
  return Math.round((a - b) / 86_400_000);
}

function ymDayUtcMidnight(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(d);
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value);
  const day = Number(parts.find((p) => p.type === "day")!.value);
  return Date.UTC(y, m - 1, day);
}

// ---- Formatting -----------------------------------------------------------

/** Whole-dollar, thousands-separated. Blank for zero to match the legacy look. */
export function money0(n: number): string {
  if (!n) return "";
  return `${n < 0 ? "-" : ""}$${Math.round(Math.abs(n)).toLocaleString()}`;
}

export function money2(n: number): string {
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Escape a value for a CSV cell: quote when needed, and neutralise leading
 * `= + @` so spreadsheet apps don't evaluate exported text as a formula.
 * (Leading `-` is left alone so negative numbers stay numeric.)
 */
export function csvCell(v: string | number): string {
  let s = String(v ?? "");
  if (/^[=+@]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const STANDARD_REPORTS = [
  { slug: "sales-analysis", name: "Sales Analysis by Salesperson & Customer", description: "3-year monthly sales comparison (fiscal Oct–Sep), grouped by salesperson then customer." },
  { slug: "open-orders-by-salesperson", name: "Open Orders by Salesperson", description: "Open orders grouped by salesperson, due month, territory, and customer." },
  { slug: "open-orders-by-type", name: "Open Orders by Type", description: "Open orders grouped by product/decoration type, sorted by due date." },
  { slug: "credit", name: "Customer Credit Report", description: "Per-customer credit profile: terms, limit, trailing sales, open orders, and collection activity." },
] as const;
