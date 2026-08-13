import "server-only";
import { and, asc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { pricingMethods, pricingExtras, pricingVendorFreight, pricingRoyalties, pricingGarments } from "@/db/schema";
import {
  priceSilkscreen,
  priceEmbroidery,
  priceAsi,
  freightFor,
  type SilkscreenConfig,
  type EmbroideryConfig,
  type AsiConfig,
  type PriceResult,
  type Tier,
} from "./engine";

const n = (v: string | null | undefined) => (v == null ? null : Number(v));

export async function getMethod(key: string) {
  return db.query.pricingMethods.findFirst({ where: eq(pricingMethods.key, key) });
}

export async function listRoyalties() {
  return db.select().from(pricingRoyalties).where(eq(pricingRoyalties.active, true)).orderBy(asc(pricingRoyalties.name));
}
export async function listExtras() {
  return db.select().from(pricingExtras).where(eq(pricingExtras.active, true)).orderBy(asc(pricingExtras.sortOrder));
}
export async function listFreight() {
  return db.select().from(pricingVendorFreight).where(eq(pricingVendorFreight.active, true)).orderBy(asc(pricingVendorFreight.vendor));
}

export async function findGarment(garmentNumber: string) {
  return db.query.pricingGarments.findFirst({ where: eq(pricingGarments.garmentNumber, garmentNumber.trim()) });
}

export async function searchGarments(q: string, limit = 25) {
  const term = `%${q.trim()}%`;
  return db
    .select()
    .from(pricingGarments)
    .where(
      and(
        eq(pricingGarments.active, true),
        q.trim() ? or(ilike(pricingGarments.garmentNumber, term), ilike(pricingGarments.description, term), ilike(pricingGarments.supplier, term)) : undefined,
      ),
    )
    .orderBy(asc(pricingGarments.garmentNumber))
    .limit(limit);
}

export interface PriceRequest {
  methodKey: "silkscreen" | "embroidery" | "asi";
  garmentNumber?: string;
  garmentCost?: number; // override/direct cost when no catalog number
  qty: number;
  level?: "A" | "B" | "C"; // silkscreen
  locations?: number[]; // asi PL# per location (up to 3)
  stitch1?: number; // embroidery
  stitch2?: number;
  leftChestYoke?: boolean;
  sleeve?: boolean;
  allOverStain?: boolean;
  newDigitizing?: boolean;
  extraIds?: string[]; // ids of pricing_extras to add
  royaltyName?: string;
  tier?: Tier;
  freightVendor?: string;
}

export interface PricedLine extends PriceResult {
  garmentCost: number;
  garmentNumber: string | null;
  description: string | null;
  method: string;
  extrasApplied: { label: string; amount: number }[];
  freightApplied: number;
  royaltyPct: number;
}

/** Resolve catalog data + config and run the engine. Returns a fully priced line. */
export async function priceLine(req: PriceRequest): Promise<PricedLine> {
  const method = await getMethod(req.methodKey);
  if (!method) throw new Error(`Unknown pricing method: ${req.methodKey}`);

  let garmentCost = req.garmentCost ?? 0;
  let garmentNumber: string | null = null;
  let description: string | null = null;
  if (req.garmentNumber) {
    const g = await findGarment(req.garmentNumber);
    if (g) {
      garmentCost = Number(g.cost);
      garmentNumber = g.garmentNumber;
      description = g.description;
    }
  }

  // Resolve extras + freight into a per-garment amount.
  const extrasApplied: { label: string; amount: number }[] = [];
  if (req.extraIds?.length) {
    const rows = await listExtras();
    for (const id of req.extraIds) {
      const e = rows.find((x) => x.id === id);
      if (e && e.amount != null) extrasApplied.push({ label: e.label, amount: Number(e.amount) });
    }
  }
  let freightApplied = 0;
  if (req.freightVendor) {
    const rows = await listFreight();
    const f = rows.find((x) => x.vendor === req.freightVendor);
    if (f) freightApplied = freightFor({ vendor: f.vendor, addPerGarment: n(f.addPerGarment), freeOverCost: n(f.freeOverCost), underThreshold: n(f.underThreshold) }, garmentCost * req.qty);
  }
  const extrasAmount = extrasApplied.reduce((s, e) => s + e.amount, 0) + freightApplied;

  let royaltyPct = 0;
  if (req.royaltyName && req.royaltyName !== "None") {
    const r = (await listRoyalties()).find((x) => x.name === req.royaltyName);
    if (r) royaltyPct = Number(r.pct);
  }

  let result: PriceResult;
  if (req.methodKey === "silkscreen") {
    result = priceSilkscreen(
      { garmentCost, level: req.level ?? "A", qty: req.qty, leftChestYoke: req.leftChestYoke, sleeve: req.sleeve, allOverStain: req.allOverStain, extrasAmount, royaltyPct, tier: req.tier },
      method.config as SilkscreenConfig,
    );
  } else if (req.methodKey === "asi") {
    result = priceAsi(
      { garmentCost, qty: req.qty, locations: req.locations ?? [], allOverStain: req.allOverStain, extrasAmount, royaltyPct, tier: req.tier },
      method.config as AsiConfig,
    );
  } else {
    result = priceEmbroidery(
      { garmentCost, qty: req.qty, stitch1: req.stitch1, stitch2: req.stitch2, extrasAmount, royaltyPct, tier: req.tier, newDigitizing: req.newDigitizing },
      method.config as EmbroideryConfig,
    );
  }

  return { ...result, garmentCost, garmentNumber, description, method: method.label, extrasApplied, freightApplied, royaltyPct };
}
