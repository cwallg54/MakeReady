import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { db } from "../src/db";
import { designBrands, designSuffixes } from "../src/db/schema";

/**
 * Seed the design-library reference data — brands and product/location
 * suffixes. All editable in the app. Re-runnable (upsert by code). The real
 * base designs / barcode-book rows are imported separately from the client's
 * spreadsheet.
 */
async function main() {
  const brands = [
    { code: "G54", name: "Great Mountain West", isLegacy: false, sortOrder: 1 },
    { code: "ESM", name: "Earth Sun Moon (legacy)", isLegacy: true, sortOrder: 2 },
  ];
  for (const b of brands) {
    await db.insert(designBrands).values(b).onConflictDoUpdate({ target: designBrands.code, set: { name: b.name, isLegacy: b.isLegacy, sortOrder: b.sortOrder } });
  }

  const suffixes = [
    // Products
    ["T", "Tee", "product"], ["HD", "Hoodie", "product"], ["PA", "Patch", "product"],
    ["KZ", "Koozie", "product"], ["PE", "Pen", "product"], ["MG", "Mug", "product"],
    ["ST", "Sticker", "product"], ["DE", "Decal", "product"], ["OR", "Ornament", "product"],
    ["MA", "Magnet", "product"], ["KC", "Key Chain", "product"], ["PN", "Pin", "product"],
    ["WD", "Wood Product", "product"], ["MI", "Miscellaneous", "product"],
    // Print locations (softgoods)
    ["FF", "Full Front", "location"], ["FB", "Full Back", "location"], ["LC", "Left Chest", "location"],
    ["RC", "Right Chest", "location"], ["LS", "Left Sleeve", "location"], ["RS", "Right Sleeve", "location"],
    ["YK", "Yoke", "location"], ["OFH", "Off-Hand / Special", "location"],
  ] as const;
  for (let i = 0; i < suffixes.length; i++) {
    const [code, label, kind] = suffixes[i];
    await db.insert(designSuffixes).values({ code, label, kind, sortOrder: i + 1 }).onConflictDoUpdate({ target: designSuffixes.code, set: { label, kind, sortOrder: i + 1 } });
  }

  console.log(`Seeded ${brands.length} brands and ${suffixes.length} suffixes.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
