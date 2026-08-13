import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { readFileSync } from "fs";
import { join } from "path";
import { db } from "../src/db";
import {
  pricingMethods,
  pricingGarments,
  pricingExtras,
  pricingVendorFreight,
  pricingRoyalties,
} from "../src/db/schema";

/**
 * Seed the softgoods pricing engine from the extracted workbook data
 * (scripts/pricing-seed-data.json). Idempotent: upserts by natural key so it can
 * be re-run after a spreadsheet refresh. Run: npx tsx scripts/seed-pricing.ts
 */
async function main() {
  const data = JSON.parse(readFileSync(join(__dirname, "pricing-seed-data.json"), "utf8"));

  // Methods (band matrices as JSON config).
  const methods = [
    { key: "silkscreen", label: "Silkscreen", config: data.silkscreen },
    { key: "embroidery", label: "Embroidery", config: data.embroidery },
    { key: "dtf", label: "DTF transfer", config: data.dtf },
  ];
  for (const m of methods) {
    await db
      .insert(pricingMethods)
      .values({ key: m.key, label: m.label, config: m.config, updatedAt: new Date() })
      .onConflictDoUpdate({ target: pricingMethods.key, set: { label: m.label, config: m.config, updatedAt: new Date() } });
  }
  console.log(`methods: ${methods.length}`);

  // Garments.
  let g = 0;
  for (const row of data.garments) {
    await db
      .insert(pricingGarments)
      .values({
        garmentNumber: row.garmentNumber,
        itemCode: row.itemCode || null,
        cost: String(row.cost),
        supplier: row.supplier || null,
        description: row.description || null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: pricingGarments.garmentNumber,
        set: { cost: String(row.cost), supplier: row.supplier || null, description: row.description || null, itemCode: row.itemCode || null, updatedAt: new Date() },
      });
    g++;
  }
  console.log(`garments: ${g}`);

  // Extras — clear + reinsert (small list, keeps sort order clean).
  await db.delete(pricingExtras);
  let i = 0;
  for (const e of data.silkscreen.extras) {
    await db.insert(pricingExtras).values({
      label: e.label,
      kind: e.kind,
      amount: e.amount == null ? null : String(e.amount),
      manualQuote: !!e.manualQuote,
      sortOrder: i++,
    });
  }
  console.log(`extras: ${i}`);

  // Vendor freight.
  await db.delete(pricingVendorFreight);
  for (const f of data.vendorFreight) {
    await db.insert(pricingVendorFreight).values({
      vendor: f.vendor,
      addPerGarment: f.addPerGarment == null ? null : String(f.addPerGarment),
      freeOverCost: f.freeOverCost == null ? null : String(f.freeOverCost),
      underThreshold: f.underThreshold == null ? null : String(f.underThreshold),
    });
  }
  console.log(`freight: ${data.vendorFreight.length}`);

  // Royalties.
  for (const r of data.royalties) {
    await db
      .insert(pricingRoyalties)
      .values({ name: r.name, pct: String(r.pct) })
      .onConflictDoUpdate({ target: pricingRoyalties.name, set: { pct: String(r.pct) } });
  }
  console.log(`royalties: ${data.royalties.length}`);

  const all = await db.select({ id: pricingGarments.id }).from(pricingGarments);
  console.log(`done. pricing_garments now has ${all.length} rows.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
