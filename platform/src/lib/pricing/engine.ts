/**
 * Softgoods pricing engine — reverse-engineered from the "Version 11 – 2026
 * Softgood Pricing Calculator Tool" workbook (Silkscreen + Embroidery tabs).
 *
 * The spreadsheet expanded its multiplier bands to a 27k-row per-cent lookup; we
 * keep the compact bands and compute directly. One improvement over the sheet:
 * quantity falls into the highest break ≤ qty (the sheet used an exact match, so
 * a non-standard quantity produced #N/A). Everything else matches to the cent.
 */

export type Tier = "list" | "HV" | "MV";

export interface MultiplierBand {
  level?: string | null; // "A" | "B" | "C" for silkscreen; absent for embroidery
  costMin: number;
  costMax: number | null; // null = open-ended top band
  byQty: Record<string, number | null>; // qtyBreak -> multiplier ("N/A" -> null)
}
export interface LocationCharge {
  level: string; // "0" | "A" | "B" | "C"
  byQty: Record<string, number | null>;
}
export interface StitchCharge {
  stitchMax: number; // charge bracket ceiling (stitches)
  byQty: Record<string, number | null>;
}

export interface SilkscreenConfig {
  qtyBreaks: number[];
  multipliers: MultiplierBand[];
  locationCharges: LocationCharge[];
  sizeUpcharges: Record<string, number>; // { "2XL": 2, "3XL": 3.5 }
  locationAdders: { leftChestYoke: number; sleeve: number; allOverStain: number };
  tiers: { HV: number; MV: number }; // garment-portion multipliers, e.g. 0.97 / 0.95
}
export interface EmbroideryConfig {
  qtyBreaks: number[];
  multipliers: MultiplierBand[];
  stitchCharges: StitchCharge[];
  sizeUpcharges: Record<string, number>;
  digitizingNew: number;
  tiers: { HV: number; MV: number };
}

export interface PriceResult {
  unit: number; // S–XL decorated unit price
  bySize: Record<string, number>; // includes 2XL/3XL upcharges
  royaltyUnit: number | null; // unit with royalty applied (null if no royalty)
  oneTime: number; // one-time charges (e.g. embroidery digitizing)
  breakdown: Record<string, number>; // component contributions for display/debug
  qtyBreak: number;
  warnings: string[];
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Highest break ≤ qty; if qty is below the smallest break, use the smallest. */
export function qtyBreakFor(qty: number, breaks: number[]): number {
  const sorted = [...breaks].sort((a, b) => a - b);
  let chosen = sorted[0];
  for (const b of sorted) if (qty >= b) chosen = b;
  return chosen;
}

function tierFactor(tier: Tier, tiers: { HV: number; MV: number }): number {
  return tier === "HV" ? tiers.HV : tier === "MV" ? tiers.MV : 1;
}

function multiplierFor(
  bands: MultiplierBand[],
  cost: number,
  qtyBreak: number,
  level: string | null,
): number | null {
  const band = bands.find(
    (b) =>
      (level == null || (b.level ?? null) === level) &&
      cost >= b.costMin &&
      (b.costMax == null || cost <= b.costMax),
  );
  if (!band) return null;
  const v = band.byQty[String(qtyBreak)];
  return typeof v === "number" ? v : null;
}

export interface SilkscreenInput {
  garmentCost: number;
  level: "A" | "B" | "C";
  qty: number;
  leftChestYoke?: boolean;
  sleeve?: boolean;
  allOverStain?: boolean;
  extrasAmount?: number; // summed per-garment extras + vendor freight
  royaltyPct?: number; // 0.07 = 7%
  tier?: Tier;
}

export function priceSilkscreen(input: SilkscreenInput, cfg: SilkscreenConfig): PriceResult {
  const warnings: string[] = [];
  const qtyBreak = qtyBreakFor(input.qty, cfg.qtyBreaks);
  const mult = multiplierFor(cfg.multipliers, input.garmentCost, qtyBreak, input.level);
  const loc = cfg.locationCharges.find((l) => l.level === input.level)?.byQty[String(qtyBreak)] ?? null;

  if (mult == null) warnings.push(`No multiplier for level ${input.level} at qty ${qtyBreak} — that quantity may not be offered.`);
  if (loc == null) warnings.push(`No print charge for level ${input.level} at qty ${qtyBreak}.`);

  const garmentPortion = input.garmentCost * (mult ?? 0) * tierFactor(input.tier ?? "list", cfg.tiers);
  const printCharge = loc ?? 0;
  const leftChest = input.leftChestYoke ? cfg.locationAdders.leftChestYoke : 0;
  const sleeve = input.sleeve ? cfg.locationAdders.sleeve : 0;
  const stain = input.allOverStain ? cfg.locationAdders.allOverStain : 0;
  const extras = input.extrasAmount ?? 0;

  const unit = round2(garmentPortion + printCharge + leftChest + sleeve + stain + extras);
  const royaltyPct = input.royaltyPct ?? 0;
  const royaltyUnit = royaltyPct > 0.0001 ? round2(unit * (1 + royaltyPct)) : null;

  const bySize: Record<string, number> = { "S-XL": unit };
  for (const [size, up] of Object.entries(cfg.sizeUpcharges)) bySize[size] = round2(unit + up);

  return {
    unit,
    bySize,
    royaltyUnit,
    oneTime: 0,
    breakdown: { garmentPortion: round2(garmentPortion), printCharge, leftChest, sleeve, stain, extras, multiplier: mult ?? 0 },
    qtyBreak,
    warnings,
  };
}

export interface EmbroideryInput {
  garmentCost: number;
  qty: number;
  stitch1?: number; // 1st location stitch count (0/undefined = none)
  stitch2?: number; // 2nd location stitch count
  extrasAmount?: number;
  royaltyPct?: number;
  tier?: Tier;
  newDigitizing?: boolean; // one-time digitizing for new art
}

function stitchChargeFor(charges: StitchCharge[], stitches: number, qtyBreak: number): number {
  if (!stitches || stitches <= 0) return 0;
  const sorted = [...charges].sort((a, b) => a.stitchMax - b.stitchMax);
  const bracket = sorted.find((c) => stitches <= c.stitchMax) ?? sorted[sorted.length - 1];
  const v = bracket?.byQty[String(qtyBreak)];
  return typeof v === "number" ? v : 0;
}

export function priceEmbroidery(input: EmbroideryInput, cfg: EmbroideryConfig): PriceResult {
  const warnings: string[] = [];
  const qtyBreak = qtyBreakFor(input.qty, cfg.qtyBreaks);
  const mult = multiplierFor(cfg.multipliers, input.garmentCost, qtyBreak, null);
  if (mult == null) warnings.push(`No embroidery multiplier at qty ${qtyBreak}.`);

  const garmentPortion = input.garmentCost * (mult ?? 0) * tierFactor(input.tier ?? "list", cfg.tiers);
  const loc1 = stitchChargeFor(cfg.stitchCharges, input.stitch1 ?? 0, qtyBreak);
  const loc2 = stitchChargeFor(cfg.stitchCharges, input.stitch2 ?? 0, qtyBreak);
  const extras = input.extrasAmount ?? 0;

  const unit = round2(garmentPortion + loc1 + loc2 + extras);
  const royaltyPct = input.royaltyPct ?? 0;
  const royaltyUnit = royaltyPct > 0.0001 ? round2(unit * (1 + royaltyPct)) : null;

  const bySize: Record<string, number> = { "S-XL": unit };
  for (const [size, up] of Object.entries(cfg.sizeUpcharges)) bySize[size] = round2(unit + up);

  return {
    unit,
    bySize,
    royaltyUnit,
    oneTime: input.newDigitizing ? cfg.digitizingNew : 0,
    breakdown: { garmentPortion: round2(garmentPortion), loc1, loc2, extras, multiplier: mult ?? 0 },
    qtyBreak,
    warnings,
  };
}

export interface FreightRule {
  vendor: string;
  addPerGarment: number | null;
  freeOverCost: number | null;
  underThreshold: number | null;
}

/** Per-garment freight for a vendor, given the order's total garment cost. */
export function freightFor(rule: FreightRule, orderGarmentCost: number): number {
  if (rule.addPerGarment == null) return 0;
  if (rule.freeOverCost != null && orderGarmentCost >= rule.freeOverCost) return 0;
  if (rule.underThreshold != null && orderGarmentCost >= rule.underThreshold) return 0;
  return rule.addPerGarment;
}
