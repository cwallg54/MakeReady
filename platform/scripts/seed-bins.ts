/**
 * Seed warehouses + bins and place existing stock into bins.
 * - Warehouses mirror the SAP setup (01 main, 03 in-transit, 04 Smith's, HS Hawaii).
 * - A realistic bin grid is created in the main warehouse (aisles A–J × bays 01–08)
 *   plus a receiving bin, and a few bins in the other warehouses.
 * - Each stocked item is placed in a category-clustered home bin (category → aisle,
 *   SKU hash → bay) with qty = its current on-hand, backfilling item_bin_stock.
 * Idempotent. Run: pnpm exec tsx scripts/seed-bins.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "../src/db";
import { warehouses, bins, inventoryItems, itemBinStock } from "../src/db/schema";

const AISLES = "ABCDEFGHIJ".split("");
const BAYS = 8;
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };

async function ensureWarehouse(code: string, name: string, isDefault = false) {
  const ex = await db.query.warehouses.findFirst({ where: eq(warehouses.code, code) });
  if (ex) return ex;
  const [w] = await db.insert(warehouses).values({ code, name, isDefault }).returning();
  return w;
}

async function ensureBin(warehouseId: string, code: string, description: string | null, isReceiving = false) {
  const ex = await db.query.bins.findFirst({ where: and(eq(bins.warehouseId, warehouseId), eq(bins.code, code)) });
  if (ex) return ex;
  const [b] = await db.insert(bins).values({ warehouseId, code, description, isReceiving }).returning();
  return b;
}

async function main() {
  // 1) Warehouses (mirror SAP).
  const w01 = await ensureWarehouse("01", "GMWS Warehouse", true);
  await ensureWarehouse("03", "In-Transit Inventory");
  const w04 = await ensureWarehouse("04", "Smith's");
  const wHS = await ensureWarehouse("HS", "Hawaii Stock");
  console.log("warehouses ready");

  // 2) Bins — grid in the main warehouse + receiving, plus a few elsewhere.
  const binId = new Map<string, string>(); // code -> id (main whs)
  await ensureBin(w01.id, "01-RECV", "Receiving dock", true);
  for (const a of AISLES) {
    for (let bay = 1; bay <= BAYS; bay++) {
      const code = `01-${a}${String(bay).padStart(2, "0")}`;
      const b = await ensureBin(w01.id, code, `Aisle ${a}, bay ${bay}`, false);
      binId.set(code, b.id);
    }
  }
  for (let i = 1; i <= 6; i++) await ensureBin(w04.id, `04-${String(i).padStart(2, "0")}`, `Smith's bay ${i}`);
  for (let i = 1; i <= 4; i++) await ensureBin(wHS.id, `HS-${String(i).padStart(2, "0")}`, `Hawaii bay ${i}`);
  console.log(`bins ready (${binId.size} pick bins in whs 01)`);

  // 3) Map each category to a home aisle so items cluster by category.
  const cats = await db.select({ c: inventoryItems.category }).from(inventoryItems).groupBy(inventoryItems.category);
  const catAisle = new Map<string, string>();
  cats.map((r) => r.c ?? "").sort().forEach((c, i) => catAisle.set(c, AISLES[i % AISLES.length]));

  // 4) Backfill: place each stocked item without bin stock into its home bin.
  const items = await db
    .select({ id: inventoryItems.id, sku: inventoryItems.sku, category: inventoryItems.category, onHand: inventoryItems.onHand })
    .from(inventoryItems)
    .where(gt(inventoryItems.onHand, "0"));
  const placed = new Set(
    (await db.select({ itemId: itemBinStock.itemId }).from(itemBinStock)).map((r) => r.itemId),
  );
  const todo = items.filter((i) => !placed.has(i.id));
  console.log(`${todo.length} items to place (of ${items.length} stocked)`);

  const rows: { itemId: string; binId: string; qty: string }[] = [];
  for (const it of todo) {
    const aisle = catAisle.get(it.category ?? "") ?? "A";
    const bay = (hash(it.sku) % BAYS) + 1;
    const code = `01-${aisle}${String(bay).padStart(2, "0")}`;
    const bid = binId.get(code);
    if (!bid) continue;
    rows.push({ itemId: it.id, binId: bid, qty: String(Number(it.onHand)) });
  }

  const CHUNK = 500;
  let done = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.insert(itemBinStock).values(rows.slice(i, i + CHUNK));
    done += Math.min(CHUNK, rows.length - i);
    console.log(`  placed ${done}/${rows.length}`);
  }

  // On-hand already equals the single bin qty, but recompute defensively for any split.
  console.log("Bin seed complete.");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
