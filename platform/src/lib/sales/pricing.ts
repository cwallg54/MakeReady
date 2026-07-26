/**
 * Shared pricing engine for the order-form / quote builder. Pure functions —
 * no DB — so it runs identically on server (persist) and client (live preview).
 */

export type ChargeType = "flat" | "per_unit" | "per_color" | "per_hour" | "percent";
export type ChargeCondition = "always" | "new" | "reorder";

export interface ChargeRule {
  key: string;
  label: string;
  type: ChargeType;
  rate: number;
  unit?: string; // human hint for the input (e.g. "colors", "hours")
  appliesWhen?: ChargeCondition;
}

export interface QuoteLineInput {
  itemCode?: string;
  description: string;
  qty: number;
  unitPrice: number;
}

export interface AppliedChargeInput {
  key: string;
  inputQty?: number; // colors / hours; ignored for flat/per_unit/percent
}

export interface PricedLine extends QuoteLineInput {
  extended: number;
}
export interface PricedCharge {
  key: string;
  label: string;
  type: ChargeType;
  rate: number;
  inputQty: number;
  amount: number;
}
export interface PricedQuote {
  lines: PricedLine[];
  charges: PricedCharge[];
  subtotal: number;
  chargesTotal: number;
  discount: number;
  total: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** A quantity price-break band: at `minQty` and above, the item sells for `unitPrice`. */
export interface PriceBreak {
  minQty: number;
  unitPrice: number;
}
/** Per-size upcharge added to the unit price, keyed by size label. */
export type SizeUpcharges = Record<string, number>;

/** Sell price from supplier cost + markup %. */
export function sellPrice(supplierCost: number, markupPct: number): number {
  return round2((supplierCost || 0) * (1 + (markupPct || 0) / 100));
}

/**
 * Resolve a unit price for a given quantity against ascending price-break bands.
 * Returns the price of the highest band whose minQty ≤ qty. If qty falls below
 * the smallest band (or no bands exist), falls back to the smallest band's price
 * — or `base` when there are no bands at all. Pure; used by both client preview
 * and server persistence so they always agree.
 */
export function resolveUnitPrice(
  breaks: PriceBreak[] | null | undefined,
  qty: number,
  base: number,
): number {
  const valid = (breaks ?? []).filter((b) => b && Number.isFinite(b.minQty) && Number.isFinite(b.unitPrice));
  if (valid.length === 0) return round2(base || 0);
  const sorted = [...valid].sort((a, b) => a.minQty - b.minQty);
  let price = sorted[0].unitPrice; // below the smallest band → smallest-qty (highest) price
  for (const b of sorted) if ((qty || 0) >= b.minQty) price = b.unitPrice;
  return round2(price);
}

/** Upcharge for a chosen size, or 0 when none applies. */
export function sizeUpcharge(map: SizeUpcharges | null | undefined, size: string | undefined): number {
  if (!map || !size) return 0;
  return round2(Number(map[size] ?? 0) || 0);
}

export function chargeApplies(rule: ChargeRule, isReorder: boolean): boolean {
  const w = rule.appliesWhen ?? "always";
  return w === "always" || (w === "new" && !isReorder) || (w === "reorder" && isReorder);
}

function chargeAmount(rule: ChargeRule, inputQty: number, subtotal: number, totalQty: number): number {
  switch (rule.type) {
    case "flat":
      return rule.rate;
    case "per_unit":
      return rule.rate * totalQty;
    case "per_color":
    case "per_hour":
      return rule.rate * (inputQty || 0);
    case "percent":
      return (rule.rate / 100) * subtotal;
    default:
      return 0;
  }
}

export function priceQuote(opts: {
  lines: QuoteLineInput[];
  rules: ChargeRule[];
  applied: AppliedChargeInput[];
  isReorder: boolean;
  discount: number;
}): PricedQuote {
  const lines: PricedLine[] = opts.lines.map((l) => ({
    ...l,
    extended: round2((l.qty || 0) * (l.unitPrice || 0)),
  }));
  const subtotal = round2(lines.reduce((s, l) => s + l.extended, 0));
  const totalQty = lines.reduce((s, l) => s + (l.qty || 0), 0);

  const appliedMap = new Map(opts.applied.map((a) => [a.key, a.inputQty ?? 1]));
  const charges: PricedCharge[] = [];
  for (const rule of opts.rules) {
    if (!appliedMap.has(rule.key)) continue;
    if (!chargeApplies(rule, opts.isReorder)) continue;
    const inputQty = appliedMap.get(rule.key) ?? 1;
    charges.push({
      key: rule.key,
      label: rule.label,
      type: rule.type,
      rate: rule.rate,
      inputQty,
      amount: round2(chargeAmount(rule, inputQty, subtotal, totalQty)),
    });
  }
  const chargesTotal = round2(charges.reduce((s, c) => s + c.amount, 0));
  const discount = round2(opts.discount || 0);
  const total = round2(subtotal + chargesTotal - discount);
  return { lines, charges, subtotal, chargesTotal, discount, total };
}
