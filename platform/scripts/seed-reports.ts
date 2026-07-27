/**
 * Seed recommended saved reports across all data sources. Idempotent by name.
 * Run: pnpm exec tsx scripts/seed-reports.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { reportDefinitions } from "../src/db/schema";

const REPORTS = [
  {
    name: "Active Pipeline (Leads & Prospects)", description: "Open accounts working toward a first order",
    source: "business_partners",
    config: { columns: ["bpNumber", "companyName", "stage", "leadSource", "owner", "createdAt"], filters: [{ field: "stage", op: "in", value: "lead,prospect" }], sortField: "createdAt", sortDir: "desc", rowLimit: 500 },
  },
  {
    name: "Customers by State", description: "All customers grouped by state",
    source: "business_partners",
    config: { columns: ["companyName", "city", "state", "owner"], filters: [{ field: "stage", op: "eq", value: "customer" }], groupField: "state", sortField: "companyName", sortDir: "asc", rowLimit: 5000 },
  },
  {
    name: "Open Quotes", description: "Draft and sent quotes awaiting a decision",
    source: "quotes",
    config: { columns: ["quoteNumber", "customer", "status", "total", "createdAt"], filters: [{ field: "status", op: "in", value: "draft,sent" }], sortField: "total", sortDir: "desc", rowLimit: 500 },
  },
  {
    name: "Won Quotes by Status", description: "Accepted + converted quotes, grouped with value subtotals",
    source: "quotes",
    config: { columns: ["quoteNumber", "customer", "status", "total"], filters: [{ field: "status", op: "in", value: "accepted,converted" }], groupField: "status", sortField: "total", sortDir: "desc", rowLimit: 1000 },
  },
  {
    name: "Open Orders by Stage", description: "Orders not yet delivered, grouped by stage",
    source: "orders",
    config: { columns: ["orderNumber", "customer", "stage", "inHandsDate", "createdAt"], filters: [{ field: "stage", op: "in", value: "received,art_proof,production,quality,shipped" }], groupField: "stage", sortField: "inHandsDate", sortDir: "asc", rowLimit: 1000 },
  },
  {
    name: "Production WIP by Status", description: "In-flight production jobs grouped by status",
    source: "production_jobs",
    config: { columns: ["orderNumber", "customer", "status", "assignee", "dueDate"], filters: [{ field: "status", op: "in", value: "queued,in_production,quality_check,ready_to_ship" }], groupField: "status", sortField: "dueDate", sortDir: "asc", rowLimit: 1000 },
  },
  {
    name: "Inventory Valuation by Category", description: "Stock value grouped by category with subtotals",
    source: "inventory_items",
    config: { columns: ["category", "sku", "name", "onHand", "cost", "value"], filters: [{ field: "onHand", op: "gt", value: "0" }], groupField: "category", sortField: "value", sortDir: "desc", rowLimit: 5000 },
  },
  {
    name: "Stock Receipts — Last 30 Days", description: "Inventory received in the last 30 days",
    source: "stock_movements",
    config: { columns: ["createdAt", "sku", "item", "delta", "note"], filters: [{ field: "reason", op: "eq", value: "receive" }, { field: "createdAt", op: "last_days", value: "30" }], sortField: "createdAt", sortDir: "desc", rowLimit: 1000 },
  },
];

async function main() {
  let created = 0;
  for (const r of REPORTS) {
    const existing = await db.query.reportDefinitions.findFirst({ where: eq(reportDefinitions.name, r.name) });
    if (existing) { console.log("= exists:", r.name); continue; }
    await db.insert(reportDefinitions).values({ name: r.name, description: r.description, source: r.source, config: r.config });
    created++;
    console.log("+ seeded:", r.name);
  }
  console.log(`Report seed complete — ${created} new, ${REPORTS.length - created} existing.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
