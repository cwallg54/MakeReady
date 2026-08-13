import { readFileSync } from "fs";
import { join } from "path";
import { priceSilkscreen, priceEmbroidery, dtfSurchargePerPiece, priceAsi } from "../src/lib/pricing/engine";

/**
 * Parity check: run the engine on the two worked examples baked into the
 * workbook and assert they match to the cent. Run: npx tsx scripts/verify-pricing.ts
 */
const data = JSON.parse(readFileSync(join(__dirname, "pricing-seed-data.json"), "utf8"));
let failures = 0;
function expect(label: string, got: number, want: number) {
  const ok = Math.abs(got - want) < 0.005;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: got ${got}  want ${want}`);
  if (!ok) failures++;
}

// Silkscreen: garment cost 13.99, level b, qty 144, extras 0.15 → 24.25 (workbook F4=24.2545)
const ss = priceSilkscreen(
  { garmentCost: 13.99, level: "B", qty: 144, extrasAmount: 0.15 },
  data.silkscreen,
);
expect("SS unit (13.99/B/144/+0.15)", ss.unit, 24.25);
expect("SS 2XL (+2)", ss.bySize["2XL"], 26.25);
expect("SS 3XL (+3.5)", ss.bySize["3XL"], 27.75);

// Embroidery: garment cost 11.73, qty 48, no stitch/extras → 21.82 (workbook F4=21.8178)
const emb = priceEmbroidery({ garmentCost: 11.73, qty: 48 }, data.embroidery);
expect("EMB unit (11.73/48)", emb.unit, 21.82);
expect("EMB 2XL (+2)", emb.bySize["2XL"], 23.82);

// Royalty example: SS with 7% (Advice From) on the 24.25 base → 25.95
const ssRoy = priceSilkscreen(
  { garmentCost: 13.99, level: "B", qty: 144, extrasAmount: 0.15, royaltyPct: 0.07 },
  data.silkscreen,
);
expect("SS royalty 7%", ssRoy.royaltyUnit ?? 0, 25.95);

// DTF: 12 decals at 3"×3" → $5.60/pc (workbook N12)
const dtf = dtfSurchargePerPiece({ widthIn: 3, heightIn: 3, qty: 12 }, data.dtf);
expect("DTF /pc (3x3, qty 12)", dtf.perPiece, 5.6);

// ASI: cost 2.26, qty 144, three PL#2 locations → 2.26×2.13 + 1.85×3 = 10.36.
// (The workbook itself errors here on a broken VLOOKUP; this is the intended math.)
const asi = priceAsi({ garmentCost: 2.26, qty: 144, locations: [2, 2, 2] }, data.asi);
expect("ASI unit (2.26/144/3×PL2)", asi.unit, 10.36);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
