import "server-only";
import { and, asc, desc, eq, gt, gte, ilike, inArray, lt, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { businessPartners, users, accountGroups, quotes, orders, inventoryItems } from "@/db/schema";
import type { ReportConfig, ReportFilter } from "./sources";

// Runtime column map + base query per source. Column refs come only from this
// registry (never user input), and filter values are bound parameters — so a
// saved definition can't inject SQL.
type ColMap = Record<string, unknown>;
interface SourceRt { columns: ColMap; query: () => unknown }

const SOURCES: Record<string, SourceRt> = {
  business_partners: {
    columns: {
      bpNumber: businessPartners.bpNumber, companyName: businessPartners.companyName,
      stage: businessPartners.lifecycleStage, leadSource: businessPartners.leadSource,
      city: businessPartners.addressCity, state: businessPartners.addressState,
      email: businessPartners.email, phone: businessPartners.phone,
      owner: users.name, accountGroup: accountGroups.name, createdAt: businessPartners.createdAt,
    },
    query: () =>
      db.select({
        bpNumber: businessPartners.bpNumber, companyName: businessPartners.companyName,
        stage: businessPartners.lifecycleStage, leadSource: businessPartners.leadSource,
        city: businessPartners.addressCity, state: businessPartners.addressState,
        email: businessPartners.email, phone: businessPartners.phone,
        owner: users.name, accountGroup: accountGroups.name, createdAt: businessPartners.createdAt,
      }).from(businessPartners)
        .leftJoin(users, eq(businessPartners.ownerId, users.id))
        .leftJoin(accountGroups, eq(businessPartners.accountGroupId, accountGroups.id))
        .$dynamic(),
  },
  quotes: {
    columns: {
      quoteNumber: quotes.quoteNumber, customer: businessPartners.companyName, status: quotes.status,
      subtotal: quotes.subtotal, total: quotes.total, createdAt: quotes.createdAt,
    },
    query: () =>
      db.select({
        quoteNumber: quotes.quoteNumber, customer: businessPartners.companyName, status: quotes.status,
        subtotal: quotes.subtotal, total: quotes.total, createdAt: quotes.createdAt,
      }).from(quotes).leftJoin(businessPartners, eq(quotes.bpId, businessPartners.id)).$dynamic(),
  },
  orders: {
    columns: {
      orderNumber: orders.orderNumber, customer: businessPartners.companyName, stage: orders.stage,
      inHandsDate: orders.inHandsDate, createdAt: orders.createdAt,
    },
    query: () =>
      db.select({
        orderNumber: orders.orderNumber, customer: businessPartners.companyName, stage: orders.stage,
        inHandsDate: orders.inHandsDate, createdAt: orders.createdAt,
      }).from(orders).leftJoin(businessPartners, eq(orders.bpId, businessPartners.id)).$dynamic(),
  },
  inventory_items: {
    columns: {
      sku: inventoryItems.sku, name: inventoryItems.name, category: inventoryItems.category,
      unit: inventoryItems.unit, supplier: inventoryItems.supplier, cost: inventoryItems.cost,
      onHand: inventoryItems.onHand, reorderPoint: inventoryItems.reorderPoint,
      value: sql<string>`(${inventoryItems.cost} * ${inventoryItems.onHand})`,
    },
    query: () =>
      db.select({
        sku: inventoryItems.sku, name: inventoryItems.name, category: inventoryItems.category,
        unit: inventoryItems.unit, supplier: inventoryItems.supplier, cost: inventoryItems.cost,
        onHand: inventoryItems.onHand, reorderPoint: inventoryItems.reorderPoint,
        value: sql<string>`(${inventoryItems.cost} * ${inventoryItems.onHand})`,
      }).from(inventoryItems).$dynamic(),
  },
};

function condition(col: unknown, f: ReportFilter): SQL | null {
  const c = col as never;
  const v = (f.value ?? "").trim();
  if (!v && f.op !== "last_days") return null;
  switch (f.op) {
    case "contains": return ilike(c, `%${v}%`);
    case "eq": return eq(c, v);
    case "gt": return gt(c, Number(v));
    case "lt": return lt(c, Number(v));
    case "after": return gt(c, new Date(v));
    case "before": return lt(c, new Date(v));
    case "last_days": return gte(c, new Date(Date.now() - (Number(v) || 30) * 86400000));
    case "in": return inArray(c, v.split(",").map((s) => s.trim()).filter(Boolean));
    default: return null;
  }
}

export interface ReportResult { columns: string[]; rows: Record<string, unknown>[] }

/** Execute a saved report definition. `previewLimit` caps rows for UI preview. */
export async function runReport(source: string, config: ReportConfig, previewLimit?: number): Promise<ReportResult> {
  const src = SOURCES[source];
  if (!src) throw new Error(`Unknown report source: ${source}`);
  const cfg: ReportConfig = { columns: config.columns ?? [], filters: config.filters ?? [], sortField: config.sortField, sortDir: config.sortDir, rowLimit: config.rowLimit };

  let q = src.query() as {
    where: (w: SQL) => typeof q; orderBy: (o: SQL) => typeof q; limit: (n: number) => Promise<Record<string, unknown>[]>;
  };

  const conds = (cfg.filters ?? [])
    .map((f) => (src.columns[f.field] ? condition(src.columns[f.field], f) : null))
    .filter((x): x is SQL => !!x);
  if (conds.length) q = q.where(and(...conds) as SQL);

  if (cfg.sortField && src.columns[cfg.sortField]) {
    const col = src.columns[cfg.sortField] as never;
    q = q.orderBy(cfg.sortDir === "desc" ? desc(col) : asc(col));
  }

  const cap = Math.min(previewLimit ?? cfg.rowLimit ?? 1000, 5000);
  const raw = await q.limit(cap);

  const cols = cfg.columns?.length ? cfg.columns : Object.keys(src.columns);
  const rows = raw.map((r) => {
    const o: Record<string, unknown> = {};
    for (const k of cols) o[k] = r[k];
    return o;
  });
  return { columns: cols, rows };
}

export function displayValue(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

/** Render a report result as CSV. `labels` maps field keys → column headers. */
export function reportToCsv(result: ReportResult, labels: Record<string, string> = {}): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const header = result.columns.map((k) => esc(labels[k] ?? k)).join(",");
  const lines = result.rows.map((r) => result.columns.map((k) => esc(displayValue(r[k]))).join(","));
  return [header, ...lines].join("\r\n");
}
