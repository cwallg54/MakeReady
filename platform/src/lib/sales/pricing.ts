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
