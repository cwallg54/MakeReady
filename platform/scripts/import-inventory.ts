/**
 * Import stocked inventory exported from the SAP B1 backup (GMGoLive) into the
 * MakeReady inventory module. Reads NDJSON at C:\Users\CWall\gmw-inv-export.json
 * (one item per line). Idempotent on SKU — re-running only adds items not yet
 * present. On-hand from SAP is recorded as an opening-balance "count" movement.
 * Run:  pnpm exec tsx scripts/import-inventory.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import fs from "fs";
import { db } from "../src/db";
import { inventoryItems, stockMovements } from "../src/db/schema";

const FILE = "C:\\Users\\CWall\\gmw-inv-export.json";

interface Row {
  sku: string; name: string; category?: string; unit?: string;
  supplier?: string; cost?: number; onHand?: number; reorderPoint?: number; barcode?: string;
}

async function main() {
  const lines = fs.readFileSync(FILE, "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith("{"));
  const bySku = new Map<string, Row>();
  for (const l of lines) {
    try { const r = JSON.parse(l) as Row; if (r.sku && !bySku.has(r.sku)) bySku.set(r.sku, r); } catch { /* skip bad line */ }
  }
  const all = [...bySku.values()];
  console.log(`parsed ${all.length} unique items from export`);

  const existing = new Set((await db.select({ sku: inventoryItems.sku }).from(inventoryItems)).map((r) => r.sku));
  const fresh = all.filter((r) => !existing.has(r.sku));
  console.log(`${fresh.length} new, ${all.length - fresh.length} already present`);

  const CHUNK = 400;
  let done = 0;
  for (let i = 0; i < fresh.length; i += CHUNK) {
    const batch = fresh.slice(i, i + CHUNK);
    const returned = await db
      .insert(inventoryItems)
      .values(batch.map((r) => ({
        sku: r.sku.slice(0, 200),
        name: (r.name || r.sku).slice(0, 300),
        category: r.category || null,
        unit: (r.unit || "each").slice(0, 40),
        supplier: r.supplier || null,
        cost: String(Number(r.cost) || 0),
        onHand: String(Number(r.onHand) || 0),
        reorderPoint: String(Number(r.reorderPoint) || 0),
        notes: r.barcode ? `SAP barcode ${r.barcode}` : null,
      })))
      .returning({ id: inventoryItems.id, onHand: inventoryItems.onHand });

    const movs = returned
      .filter((x) => Number(x.onHand) !== 0)
      .map((x) => ({ itemId: x.id, delta: String(x.onHand), reason: "count" as const, note: "SAP opening balance" }));
    if (movs.length) await db.insert(stockMovements).values(movs);

    done += batch.length;
    console.log(`  inserted ${done}/${fresh.length}`);
  }
  console.log("Inventory import complete.");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
