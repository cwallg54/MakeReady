import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { sql } from "drizzle-orm";
import { db } from "../src/db";
import {
  decorationMethods,
  printLocations,
  colorTiers,
  embroideryTiers,
  sizeClasses,
  catalogStyles,
  catalogColors,
} from "../src/db/schema";

/**
 * Idempotent seed of the quoting-calculator reference data — decoration
 * methods, print locations, color tiers, embroidery tiers, size classes, and a
 * starter blank-garment catalog. Values reverse-engineered from GMW's
 * SharePoint order forms; all are editable in Admin. Re-runnable: code-keyed
 * rows upsert; the garment catalog is only seeded when empty.
 */
async function main() {
  // Decoration methods with GMW's screen-prep + run config.
  const methods = [
    { code: "silk_screen", name: "Silk Screen", priceMode: "per_color", sortOrder: 1, pricing: { setupPerColorNew: 15, setupPerColorReorder: 7.5, runPerColorPerUnit: 0.35, darkUpchargePerUnit: 0.4, flatSetup: 0 } },
    { code: "dtf", name: "DTF", priceMode: "per_color", sortOrder: 2, pricing: { setupPerColorNew: 0, setupPerColorReorder: 0, runPerColorPerUnit: 0.6, darkUpchargePerUnit: 0, flatSetup: 10 } },
    { code: "foil", name: "Foil", priceMode: "per_color", sortOrder: 3, pricing: { setupPerColorNew: 20, setupPerColorReorder: 10, runPerColorPerUnit: 0.75, darkUpchargePerUnit: 0, flatSetup: 0 } },
    { code: "softhand", name: "Softhand", priceMode: "per_color", sortOrder: 4, pricing: { setupPerColorNew: 15, setupPerColorReorder: 7.5, runPerColorPerUnit: 0.45, darkUpchargePerUnit: 0.4, flatSetup: 0 } },
    { code: "embroidery", name: "Embroidery", priceMode: "stitch", sortOrder: 5, pricing: { setupPerColorNew: 0, setupPerColorReorder: 0, runPerColorPerUnit: 0, darkUpchargePerUnit: 0, flatSetup: 8 } },
  ];
  for (const m of methods) {
    await db.insert(decorationMethods).values(m).onConflictDoUpdate({
      target: decorationMethods.code,
      set: { name: m.name, priceMode: m.priceMode, pricing: m.pricing, sortOrder: m.sortOrder },
    });
  }

  // 22 numbered print locations from the softgoods order form.
  const locations = [
    "Full Front", "Full Back", "Left Chest", "Right Chest", "Center Chest",
    "Left Sleeve", "Right Sleeve", "Front Yoke", "Back Yoke", "Neck Label",
    "Hood", "Left Pocket", "Right Pocket", "Left Leg", "Right Leg",
    "Hip", "Motif", "Cuff", "Collar", "Bottom Hem", "Upper Back", "Tagless Tag",
  ];
  for (let i = 0; i < locations.length; i++) {
    const name = locations[i];
    const code = name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    await db.insert(printLocations).values({ code, name, sortOrder: i + 1 }).onConflictDoUpdate({
      target: printLocations.code,
      set: { name, sortOrder: i + 1 },
    });
  }

  // Color tiers (dark drives the silk-screen underbase upcharge).
  const tiers = [
    { code: "white", name: "White", sortOrder: 1 },
    { code: "light", name: "Light", sortOrder: 2 },
    { code: "dark", name: "Dark", sortOrder: 3 },
  ];
  for (const t of tiers) {
    await db.insert(colorTiers).values(t).onConflictDoUpdate({ target: colorTiers.code, set: { name: t.name, sortOrder: t.sortOrder } });
  }

  // Embroidery tiers by stitch count.
  const emb = [
    { code: "LC", name: "Left Chest (≤8k)", maxStitches: 8000, pricePerUnit: "7.00", sortOrder: 1 },
    { code: "A", name: "Tier A (≤5k)", maxStitches: 5000, pricePerUnit: "6.00", sortOrder: 2 },
    { code: "B", name: "Tier B (≤10k)", maxStitches: 10000, pricePerUnit: "8.50", sortOrder: 3 },
    { code: "C", name: "Tier C (≤15k)", maxStitches: 15000, pricePerUnit: "11.00", sortOrder: 4 },
  ];
  for (const e of emb) {
    await db.insert(embroideryTiers).values(e).onConflictDoUpdate({
      target: embroideryTiers.code,
      set: { name: e.name, maxStitches: e.maxStitches, pricePerUnit: e.pricePerUnit, sortOrder: e.sortOrder },
    });
  }

  // Size classes with per-size upcharges.
  const classes = [
    { code: "adult", name: "Adult", sortOrder: 1, sizes: [{ size: "S", upcharge: 0 }, { size: "M", upcharge: 0 }, { size: "L", upcharge: 0 }, { size: "XL", upcharge: 0 }, { size: "2XL", upcharge: 2 }, { size: "3XL", upcharge: 3 }, { size: "4XL", upcharge: 4 }] },
    { code: "ladies", name: "Ladies", sortOrder: 2, sizes: [{ size: "S", upcharge: 0 }, { size: "M", upcharge: 0 }, { size: "L", upcharge: 0 }, { size: "XL", upcharge: 0 }, { size: "2XL", upcharge: 2 }, { size: "3XL", upcharge: 3 }] },
    { code: "youth", name: "Youth", sortOrder: 3, sizes: [{ size: "XS", upcharge: 0 }, { size: "S", upcharge: 0 }, { size: "M", upcharge: 0 }, { size: "L", upcharge: 0 }, { size: "XL", upcharge: 0 }] },
    { code: "toddler", name: "Toddler", sortOrder: 4, sizes: [{ size: "2T", upcharge: 0 }, { size: "3T", upcharge: 0 }, { size: "4T", upcharge: 0 }, { size: "5T", upcharge: 0 }] },
  ];
  for (const c of classes) {
    await db.insert(sizeClasses).values(c).onConflictDoUpdate({ target: sizeClasses.code, set: { name: c.name, sizes: c.sizes, sortOrder: c.sortOrder } });
  }

  // Starter blank-garment catalog — only when empty (avoid clobbering edits).
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(catalogStyles);
  if (n === 0) {
    const styles = [
      { brand: "Gildan", styleNumber: "5000", name: "Gildan 5000 Heavy Cotton Tee", category: "T-Shirt", sizeClassCode: "adult", basePrice: "6.50", supplierCost: "2.85", colors: [["White", "white"], ["Ash", "light"], ["Sand", "light"], ["Navy", "dark"], ["Black", "dark"], ["Red", "dark"], ["Royal", "dark"]] },
      { brand: "Bella+Canvas", styleNumber: "3001", name: "Bella+Canvas 3001 Jersey Tee", category: "T-Shirt", sizeClassCode: "adult", basePrice: "9.00", supplierCost: "4.10", colors: [["White", "white"], ["Athletic Heather", "light"], ["Natural", "light"], ["Navy", "dark"], ["Black", "dark"], ["Forest", "dark"]] },
      { brand: "Gildan", styleNumber: "18500", name: "Gildan 18500 Hoodie", category: "Hoodie", sizeClassCode: "adult", basePrice: "18.00", supplierCost: "9.25", colors: [["White", "white"], ["Sport Grey", "light"], ["Navy", "dark"], ["Black", "dark"], ["Maroon", "dark"]] },
      { brand: "Next Level", styleNumber: "1540", name: "Next Level 1540 Ladies Tee", category: "T-Shirt", sizeClassCode: "ladies", basePrice: "10.50", supplierCost: "5.00", colors: [["White", "white"], ["Silver", "light"], ["Midnight Navy", "dark"], ["Black", "dark"]] },
    ];
    for (let i = 0; i < styles.length; i++) {
      const s = styles[i];
      const [row] = await db.insert(catalogStyles).values({
        brand: s.brand, styleNumber: s.styleNumber, name: s.name, category: s.category,
        sizeClassCode: s.sizeClassCode, basePrice: s.basePrice, supplierCost: s.supplierCost, sortOrder: i + 1,
      }).returning({ id: catalogStyles.id });
      await db.insert(catalogColors).values(
        s.colors.map(([name, tier], j) => ({ styleId: row.id, name, tierCode: tier, sortOrder: j + 1 })),
      );
    }
    console.log(`Seeded ${styles.length} catalog styles.`);
  } else {
    console.log(`Catalog already has ${n} styles — skipped garment seed.`);
  }

  console.log("Catalog reference data seeded.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
