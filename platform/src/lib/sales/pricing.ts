/**
 * Shared pricing engine for the order-form / quote builder. Pure functions —
 * no DB — so it runs identically on server (persist) and client (live preview).
 */

import { priceSilkscreen, priceEmbroidery, priceAsi, type SilkscreenConfig, type EmbroideryConfig, type AsiConfig } from "@/lib/pricing/engine";

// When the softgoods pricing engine is available (garment cost + method config),
// a garment line's decorated unit price is computed from Kim's spreadsheet math
// (garment cost × qty-band multiplier + screen/stitch charges) instead of the
// older markup model. Falls back to the markup model when cost/config is absent,
// so styles without a cost are unaffected.
export interface EngineConfigs {
  silkscreen?: SilkscreenConfig;
  embroidery?: EmbroideryConfig;
  asi?: AsiConfig;
}
// Map an embroidery tier to a representative stitch count (from the tier names)
// when a decoration doesn't carry an explicit stitch count.
const TIER_STITCHES: Record<string, number> = { LC: 8000, A: 5000, B: 10000, C: 15000 };
// ASI prices each print location by a "PL #" (complexity). Map the silkscreen
// screen-color level to a PL#: A→1, B→2, C→3.
const LEVEL_PL: Record<string, number> = { A: 1, B: 2, C: 3 };
const CHEST_YOKE = new Set(["left_chest", "right_chest", "center_chest", "front_yoke", "back_yoke"]);
const SLEEVE = new Set(["left_sleeve", "right_sleeve", "cuff"]);
const LEVELS = ["A", "B", "C"] as const;
function maxLevel(decos: { level?: string }[]): "A" | "B" | "C" {
  let idx = 1; // default B
  for (const d of decos) {
    const i = LEVELS.indexOf((d.level ?? "B") as "A" | "B" | "C");
    if (i > idx) idx = i;
  }
  return LEVELS[idx];
}

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

// ---- Full quoting calculator: garments + decoration ----------------------

/** Per-method rate config stored on decoration_methods.pricing. */
export interface DecorationPricing {
  // One-time setup, per color, per decoration (new vs. reorder screen prep).
  setupPerColorNew?: number;
  setupPerColorReorder?: number;
  // Flat one-time setup per decoration (any method), regardless of colors.
  flatSetup?: number;
  // Recurring run charge, per color, per garment.
  runPerColorPerUnit?: number;
  // Underbase upcharge per garment, added on dark garments (silk screen).
  darkUpchargePerUnit?: number;
}

/** One decoration applied to a garment line (a placement + method + detail). */
export interface DecorationInput {
  location: string; // print_locations.code
  method: string; // decoration_methods.code
  colorCount?: number; // for per_color methods
  stitchTier?: string; // embroidery_tiers.code, for stitch methods
  stitchCount?: number; // explicit stitch count (softgoods embroidery engine)
  level?: "A" | "B" | "C"; // silkscreen screen-color class (softgoods engine)
}

/** A full garment quote line as sent from the builder / persisted on a quote. */
export interface GarmentLineData {
  styleId?: string | null;
  description: string;
  color?: string | null;
  colorTier?: string | null;
  sizeBreakdown: Record<string, number>;
  decorations: DecorationInput[];
  extras?: string[]; // pricing_extras ids applied per garment (barcode, folding…)
}

/** A method resolved with its price mode + rate config. */
export interface MethodRef {
  code: string;
  name: string;
  priceMode: "per_color" | "stitch" | string;
  pricing: DecorationPricing | null;
}
export interface EmbTierRef {
  code: string;
  pricePerUnit: number;
}
/** An ordered size + its upcharge, from a size class. */
export interface SizeEntry {
  size: string;
  upcharge: number;
}

/** Upcharge for a size within a size class's ordered size list. */
export function sizeClassUpcharge(sizes: SizeEntry[] | null | undefined, size: string | undefined): number {
  if (!sizes || !size) return 0;
  const hit = sizes.find((s) => s.size === size);
  return round2(Number(hit?.upcharge ?? 0) || 0);
}

/** Recurring decoration cost added to every garment's unit price. */
export function decorationRunPerUnit(
  decorations: DecorationInput[],
  methods: Map<string, MethodRef>,
  embTiers: Map<string, EmbTierRef>,
  colorTier: string | undefined,
): number {
  let perUnit = 0;
  for (const d of decorations) {
    const m = methods.get(d.method);
    if (!m) continue;
    if (m.priceMode === "stitch") {
      perUnit += embTiers.get(d.stitchTier ?? "")?.pricePerUnit ?? 0;
    } else {
      const p = m.pricing ?? {};
      perUnit += (d.colorCount ?? 0) * (p.runPerColorPerUnit ?? 0);
      if (colorTier === "dark") perUnit += p.darkUpchargePerUnit ?? 0;
    }
  }
  return round2(perUnit);
}

/** One-time setup charges generated by a line's decorations. */
export function decorationSetups(
  decorations: DecorationInput[],
  methods: Map<string, MethodRef>,
  isReorder: boolean,
): { label: string; amount: number }[] {
  const out: { label: string; amount: number }[] = [];
  for (const d of decorations) {
    const m = methods.get(d.method);
    if (!m || m.priceMode === "stitch") continue;
    const p = m.pricing ?? {};
    const perColor = isReorder ? p.setupPerColorReorder ?? 0 : p.setupPerColorNew ?? 0;
    const amount = round2((d.colorCount ?? 0) * perColor + (p.flatSetup ?? 0));
    if (amount > 0) out.push({ label: `${m.name} setup — ${d.location} (${d.colorCount ?? 0} color${(d.colorCount ?? 0) === 1 ? "" : "s"})`, amount });
  }
  return out;
}

export interface GarmentLinePrice {
  totalUnits: number;
  garmentSubtotal: number; // blanks + size upcharges, across all sizes
  runSubtotal: number; // recurring decoration, across all units
  extended: number; // garmentSubtotal + runSubtotal
  blendedUnitPrice: number; // extended / totalUnits (0 when no units)
  setups: { label: string; amount: number }[]; // one-time charges
}

/**
 * Price a full garment line: a blank at `basePrice`, a per-size quantity
 * breakdown, a color tier, and a set of decorations. Pure — the quote builder
 * (live preview) and the server (persist) both call this so they agree.
 */
/**
 * Engine (Kim's spreadsheet) decorated unit price for a silkscreen line, or null
 * when it doesn't apply (no config, no garment cost, or no screen-print
 * decoration). Maps decoration placements to the engine's model: the primary
 * print carries the level, chest/yoke → left-chest adder, sleeve → sleeve adder.
 */
export function engineSilkscreenUnit(opts: {
  garmentCost?: number;
  totalUnits: number;
  decorations: DecorationInput[];
  methods: Map<string, MethodRef>;
  engine?: EngineConfigs;
  tier?: "list" | "HV" | "MV";
  extrasPerUnit?: number;
}): { unit: number; sizeUpcharges: Record<string, number> } | null {
  const cfg = opts.engine?.silkscreen;
  if (!cfg || !opts.garmentCost || opts.garmentCost <= 0 || opts.totalUnits <= 0) return null;
  const perColor = opts.decorations.filter((d) => opts.methods.get(d.method)?.priceMode === "per_color");
  if (perColor.length === 0) return null; // not a screen-print line — leave to the markup model

  const main = perColor.filter((d) => !CHEST_YOKE.has(d.location) && !SLEEVE.has(d.location));
  const hasMain = main.length > 0;
  const primary = hasMain ? main : [perColor[0]];
  const level = maxLevel(primary);
  const leftChestYoke = hasMain && perColor.some((d) => CHEST_YOKE.has(d.location));
  const sleeve = hasMain && perColor.some((d) => SLEEVE.has(d.location));

  const res = priceSilkscreen(
    { garmentCost: opts.garmentCost, level, qty: opts.totalUnits, leftChestYoke, sleeve, extrasAmount: opts.extrasPerUnit ?? 0, tier: opts.tier },
    cfg,
  );
  return { unit: res.unit, sizeUpcharges: cfg.sizeUpcharges };
}

/** Engine embroidery unit price, or null when it doesn't apply. Prices the
 *  garment via the embroidery multiplier plus a per-location stitch charge for up
 *  to two stitch decorations (their stitch count, or the tier's representative). */
export function engineEmbroideryUnit(opts: {
  garmentCost?: number;
  totalUnits: number;
  decorations: DecorationInput[];
  methods: Map<string, MethodRef>;
  engine?: EngineConfigs;
  tier?: "list" | "HV" | "MV";
  extrasPerUnit?: number;
}): { unit: number; sizeUpcharges: Record<string, number> } | null {
  const cfg = opts.engine?.embroidery;
  if (!cfg || !opts.garmentCost || opts.garmentCost <= 0 || opts.totalUnits <= 0) return null;
  const stitchDecos = opts.decorations.filter((d) => opts.methods.get(d.method)?.priceMode === "stitch");
  if (stitchDecos.length === 0) return null; // not an embroidery line
  const stitchOf = (d: DecorationInput) => d.stitchCount && d.stitchCount > 0 ? d.stitchCount : TIER_STITCHES[d.stitchTier ?? ""] ?? 5000;
  const [stitch1, stitch2] = [stitchDecos[0] ? stitchOf(stitchDecos[0]) : 0, stitchDecos[1] ? stitchOf(stitchDecos[1]) : 0];

  const res = priceEmbroidery(
    { garmentCost: opts.garmentCost, qty: opts.totalUnits, stitch1, stitch2, extrasAmount: opts.extrasPerUnit ?? 0, tier: opts.tier },
    cfg,
  );
  return { unit: res.unit, sizeUpcharges: cfg.sizeUpcharges };
}

/** Engine ASI (distributor-channel) unit price for a screen-print line, or null.
 *  Each per_color decoration is a print location priced by a PL# (from its level).
 *  NOTE: the level→PL# mapping (A/B/C → 1/2/3) is an approximation to confirm
 *  against real ASI orders. */
export function engineAsiUnit(opts: {
  garmentCost?: number;
  totalUnits: number;
  decorations: DecorationInput[];
  methods: Map<string, MethodRef>;
  engine?: EngineConfigs;
  tier?: "list" | "HV" | "MV";
  extrasPerUnit?: number;
}): { unit: number; sizeUpcharges: Record<string, number> } | null {
  const cfg = opts.engine?.asi;
  if (!cfg || !opts.garmentCost || opts.garmentCost <= 0 || opts.totalUnits <= 0) return null;
  const perColor = opts.decorations.filter((d) => opts.methods.get(d.method)?.priceMode === "per_color");
  if (perColor.length === 0) return null;
  const locations = perColor.slice(0, 3).map((d) => LEVEL_PL[d.level ?? "B"] ?? 2);
  const res = priceAsi(
    { garmentCost: opts.garmentCost, qty: opts.totalUnits, locations, extrasAmount: opts.extrasPerUnit ?? 0, tier: opts.tier },
    cfg,
  );
  return { unit: res.unit, sizeUpcharges: cfg.sizeUpcharges };
}

export function priceGarmentLine(opts: {
  basePrice: number;
  sizeClassSizes: SizeEntry[] | null;
  sizeBreakdown: Record<string, number>;
  colorTier?: string;
  decorations: DecorationInput[];
  methods: Map<string, MethodRef>;
  embTiers: Map<string, EmbTierRef>;
  isReorder: boolean;
  // Softgoods engine context — when supplied, silkscreen lines price via the engine.
  engine?: EngineConfigs;
  garmentCost?: number;
  tier?: "list" | "HV" | "MV";
  extrasPerUnit?: number; // summed per-garment extras (barcode, folding…)
  asiChannel?: boolean; // ASI distributor-channel order → price screen lines via the ASI engine
}): GarmentLinePrice & { enginePriced: boolean } {
  let totalUnits = 0;
  for (const qtyRaw of Object.values(opts.sizeBreakdown ?? {})) {
    const qty = Number(qtyRaw) || 0;
    if (qty > 0) totalUnits += qty;
  }
  const extrasPerUnit = round2(opts.extrasPerUnit ?? 0);

  const engArgs = {
    garmentCost: opts.garmentCost,
    totalUnits,
    decorations: opts.decorations,
    methods: opts.methods,
    engine: opts.engine,
    tier: opts.tier,
    extrasPerUnit,
  };
  // Embroidery (stitch) lines price via the embroidery engine. Screen/DTF/foil/
  // softhand (per_color) price via the silkscreen engine — or, on an ASI-channel
  // order, via the ASI engine. Embroidery takes precedence when stitch decos exist.
  const eng = engineEmbroideryUnit(engArgs)
    ?? (opts.asiChannel ? engineAsiUnit(engArgs) : null)
    ?? engineSilkscreenUnit(engArgs);

  let garmentSubtotal = 0;
  let runSubtotal = 0;
  if (eng) {
    // Engine unit already includes the garment + decoration + extras; add per-size
    // upcharges (engine's 2XL/3XL first, else the size class's).
    for (const [size, qtyRaw] of Object.entries(opts.sizeBreakdown ?? {})) {
      const qty = Number(qtyRaw) || 0;
      if (qty <= 0) continue;
      const up = eng.sizeUpcharges[size] ?? sizeClassUpcharge(opts.sizeClassSizes, size);
      garmentSubtotal += qty * (eng.unit + up);
    }
  } else {
    const runPerUnit = decorationRunPerUnit(opts.decorations, opts.methods, opts.embTiers, opts.colorTier);
    for (const [size, qtyRaw] of Object.entries(opts.sizeBreakdown ?? {})) {
      const qty = Number(qtyRaw) || 0;
      if (qty <= 0) continue;
      garmentSubtotal += qty * (round2(opts.basePrice || 0) + sizeClassUpcharge(opts.sizeClassSizes, size) + extrasPerUnit);
    }
    runSubtotal = round2(totalUnits * runPerUnit);
  }
  garmentSubtotal = round2(garmentSubtotal);
  const extended = round2(garmentSubtotal + runSubtotal);
  return {
    totalUnits,
    garmentSubtotal,
    runSubtotal,
    extended,
    blendedUnitPrice: totalUnits ? round2(extended / totalUnits) : 0,
    setups: decorationSetups(opts.decorations, opts.methods, opts.isReorder),
    enginePriced: !!eng,
  };
}

// ── Customer contract / special pricing ────────────────────────────────────
export interface ContractRule {
  styleId: string | null; // null = applies to every garment
  type: "pct_off" | "fixed_unit";
  value: number; // pct_off: percent (0–100); fixed_unit: all-in $/unit
}

/** Pick the contract rule that governs a line: a style-specific rule wins over a
 *  blanket (styleId null) rule; returns null when none apply. */
export function pickContractRule(rules: ContractRule[] | undefined, styleId: string | null): ContractRule | null {
  if (!rules || rules.length === 0) return null;
  return (styleId ? rules.find((r) => r.styleId === styleId) : undefined) ?? rules.find((r) => !r.styleId) ?? null;
}

export type ContractPriced = GarmentLinePrice & { enginePriced: boolean; listExtended: number; contractSavings: number };

/** Apply a contract rule to a priced garment line: `pct_off` discounts the line
 *  extended by a percentage; `fixed_unit` sets an all-in unit price. Records the
 *  pre-discount list total and the savings for display. Pure. */
export function applyContract(price: GarmentLinePrice & { enginePriced: boolean }, rule: ContractRule | null): ContractPriced {
  const listExtended = price.extended;
  if (!rule || price.totalUnits <= 0) return { ...price, listExtended, contractSavings: 0 };
  let extended = listExtended;
  if (rule.type === "pct_off") extended = round2(listExtended * (1 - (rule.value || 0) / 100));
  else if (rule.type === "fixed_unit") extended = round2((rule.value || 0) * price.totalUnits);
  if (extended < 0) extended = 0;
  return {
    ...price,
    extended,
    blendedUnitPrice: price.totalUnits ? round2(extended / price.totalUnits) : 0,
    listExtended,
    contractSavings: round2(listExtended - extended),
  };
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
