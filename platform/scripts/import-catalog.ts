import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { db } from "../src/db";
import { pricingGarments, catalogStyles } from "../src/db/schema";

/**
 * Import the softgoods garment catalog (pricing_garments) into catalog_styles so
 * reps can pick any garment in the Quote Builder. Idempotent — matches on
 * style_number (= garment number); updates name/brand/base on re-run.
 *
 * Cost is intentionally NOT copied to supplier_cost: the builder resolves a
 * garment's cost from pricing_garments by style number, keeping Admin → Softgoods
 * Pricing → Garments & costs the single source of truth for price. base_price is
 * seeded to cost as a sane non-zero blank fallback (admins can mark it up).
 *
 * Run: npx tsx scripts/import-catalog.ts
 */
async function main() {
  const garments = await db.select().from(pricingGarments);
  const active = garments.filter((g) => g.active);

  const existing = await db.select({ styleNumber: catalogStyles.styleNumber, id: catalogStyles.id }).from(catalogStyles);
  const byNumber = new Map(existing.filter((e) => e.styleNumber).map((e) => [e.styleNumber as string, e.id]));

  let inserted = 0;
  let updated = 0;
  for (const g of active) {
    const name = (g.description && g.description.trim()) || `Garment ${g.garmentNumber}`;
    const brand = g.supplier ?? null;
    const basePrice = String(Number(g.cost));
    const existingId = byNumber.get(g.garmentNumber);
    if (existingId) {
      await db
        .update(catalogStyles)
        .set({ name, brand, category: "Softgoods", sizeClassCode: "adult" })
        .where(eqId(existingId));
      updated++;
    } else {
      await db.insert(catalogStyles).values({
        brand,
        styleNumber: g.garmentNumber,
        name,
        category: "Softgoods",
        sizeClassCode: "adult",
        basePrice,
        // supplierCost left null → builder uses pricing_garments cost (one source of truth)
        active: true,
      });
      inserted++;
    }
  }
  console.log(`catalog import: ${inserted} inserted, ${updated} updated (from ${active.length} garments).`);
  const total = await db.select({ id: catalogStyles.id }).from(catalogStyles);
  console.log(`catalog_styles now has ${total.length} styles.`);
  process.exit(0);
}

// Local eq helper to avoid an extra import line churn.
import { eq } from "drizzle-orm";
function eqId(id: string) {
  return eq(catalogStyles.id, id);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
