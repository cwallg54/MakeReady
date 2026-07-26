/**
 * One-off, idempotent performance indexes. Adds trigram (pg_trgm) GIN indexes so
 * `ILIKE '%q%'` search is fast, plus btree indexes for common filters/sorts.
 * Safe to re-run. Run: pnpm exec tsx scripts/optimize-db.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { sql } from "drizzle-orm";
import { db } from "../src/db";

const STATEMENTS = [
  `CREATE EXTENSION IF NOT EXISTS pg_trgm`,
  // Business Partners — search by company name, filter by stage/owner, sort by name.
  `CREATE INDEX IF NOT EXISTS bp_company_trgm ON business_partners USING gin (company_name gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS bp_company_idx ON business_partners (company_name)`,
  `CREATE INDEX IF NOT EXISTS bp_stage_idx ON business_partners (lifecycle_stage)`,
  `CREATE INDEX IF NOT EXISTS bp_owner_idx ON business_partners (owner_id)`,
  // Inventory — search by name/sku/category, filter by category, sort by name.
  `CREATE INDEX IF NOT EXISTS inv_name_trgm ON inventory_items USING gin (name gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS inv_sku_trgm ON inventory_items USING gin (sku gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS inv_category_trgm ON inventory_items USING gin (category gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS inv_name_idx ON inventory_items (name)`,
  `CREATE INDEX IF NOT EXISTS inv_category_idx ON inventory_items (category)`,
  // Order / quote status filters.
  `CREATE INDEX IF NOT EXISTS orders_stage_idx ON orders (stage)`,
  `CREATE INDEX IF NOT EXISTS quotes_status_idx ON quotes (status)`,
  // Keep the planner's stats fresh after bulk seeds.
  `ANALYZE business_partners`,
  `ANALYZE inventory_items`,
  `ANALYZE item_bin_stock`,
];

async function main() {
  for (const s of STATEMENTS) {
    process.stdout.write(`  ${s.slice(0, 60)}… `);
    await db.execute(sql.raw(s));
    console.log("ok");
  }
  console.log("DB optimization complete.");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
