/**
 * Data for the analytics standard reports: Top Products & Designs, Sales-Rep
 * Activity, and Lead-Source ROI. Server-only (imports the db).
 */
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { quotes, quoteLines, orders, activities, businessPartners, users, historicalOrders } from "@/db/schema";

export type Period = "30" | "90" | "365" | "all";

/** Start date for a period (null = all time). */
export function periodSince(period: Period): Date | null {
  if (period === "all") return null;
  const days = Number(period);
  return new Date(Date.now() - days * 86_400_000);
}

export const PERIOD_LABEL: Record<Period, string> = {
  "30": "Last 30 days",
  "90": "Last 90 days",
  "365": "Last 12 months",
  all: "All time",
};

export function parsePeriod(v: string | undefined): Period {
  return v === "30" || v === "365" || v === "all" ? v : "90";
}

// ---- Top Products & Designs ----------------------------------------------

export interface TopProductRow {
  description: string;
  qty: number;
  revenue: number;   // quoted value across all quotes
  wonRevenue: number; // value on accepted/converted quotes
  quotes: number;
}

export interface OrderTypeRow {
  orderType: string | null;
  orders: number;
  amount: number;
}

export async function getTopProducts(since: Date | null): Promise<{ products: TopProductRow[]; byType: OrderTypeRow[] }> {
  const qWhere = since ? gte(quotes.createdAt, since) : undefined;
  const products = await db
    .select({
      description: quoteLines.description,
      qty: sql<number>`COALESCE(SUM(${quoteLines.qty}), 0)::int`,
      revenue: sql<string>`COALESCE(SUM(${quoteLines.extended}), 0)`,
      wonRevenue: sql<string>`COALESCE(SUM(${quoteLines.extended}) FILTER (WHERE ${quotes.status} IN ('accepted','converted')), 0)`,
      quotes: sql<number>`COUNT(DISTINCT ${quoteLines.quoteId})::int`,
    })
    .from(quoteLines)
    .innerJoin(quotes, eq(quoteLines.quoteId, quotes.id))
    .where(qWhere)
    .groupBy(quoteLines.description)
    .orderBy(desc(sql`COALESCE(SUM(${quoteLines.extended}), 0)`))
    .limit(50);

  const oWhere = since ? and(isNull(orders.voidedAt), gte(orders.createdAt, since)) : isNull(orders.voidedAt);
  const byType = await db
    .select({
      orderType: orders.orderType,
      orders: sql<number>`COUNT(*)::int`,
      amount: sql<string>`COALESCE(SUM(${orders.amount}), 0)`,
    })
    .from(orders)
    .where(oWhere)
    .groupBy(orders.orderType)
    .orderBy(desc(sql`COALESCE(SUM(${orders.amount}), 0)`));

  return {
    products: products.map((p) => ({ description: p.description || "(no description)", qty: p.qty, revenue: Number(p.revenue), wonRevenue: Number(p.wonRevenue), quotes: p.quotes })),
    byType: byType.map((t) => ({ orderType: t.orderType, orders: t.orders, amount: Number(t.amount) })),
  };
}

// ---- Sales-Rep Activity ---------------------------------------------------

export interface RepActivityRow {
  userId: string;
  name: string;
  calls: number;
  notes: number;
  emails: number;
  visits: number;
  touches: number; // total logged, non-system
  quotes: number;
  quotesWon: number;
  wonValue: number;
  orders: number;
  orderValue: number;
}

export async function getRepActivity(since: Date | null): Promise<RepActivityRow[]> {
  const actWhere = since ? and(eq(activities.isSystem, false), gte(activities.createdAt, since)) : eq(activities.isSystem, false);
  const [people, acts, qs, ords] = await Promise.all([
    db.select({ id: users.id, name: users.name }).from(users),
    db
      .select({
        userId: activities.userId,
        calls: sql<number>`COUNT(*) FILTER (WHERE ${activities.type} = 'call')::int`,
        notes: sql<number>`COUNT(*) FILTER (WHERE ${activities.type} = 'note')::int`,
        emails: sql<number>`COUNT(*) FILTER (WHERE ${activities.type} = 'email')::int`,
        visits: sql<number>`COUNT(*) FILTER (WHERE ${activities.type} = 'visit')::int`,
        touches: sql<number>`COUNT(*)::int`,
      })
      .from(activities)
      .where(actWhere)
      .groupBy(activities.userId),
    db
      .select({
        createdBy: quotes.createdBy,
        quotes: sql<number>`COUNT(*)::int`,
        won: sql<number>`COUNT(*) FILTER (WHERE ${quotes.status} IN ('accepted','converted'))::int`,
        wonValue: sql<string>`COALESCE(SUM(${quotes.total}) FILTER (WHERE ${quotes.status} IN ('accepted','converted')), 0)`,
      })
      .from(quotes)
      .where(since ? gte(quotes.createdAt, since) : undefined)
      .groupBy(quotes.createdBy),
    db
      .select({
        salesRepId: orders.salesRepId,
        orders: sql<number>`COUNT(*)::int`,
        amount: sql<string>`COALESCE(SUM(${orders.amount}), 0)`,
      })
      .from(orders)
      .where(since ? and(isNull(orders.voidedAt), gte(orders.createdAt, since)) : isNull(orders.voidedAt))
      .groupBy(orders.salesRepId),
  ]);

  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const rows = new Map<string, RepActivityRow>();
  const row = (id: string): RepActivityRow => {
    let r = rows.get(id);
    if (!r) {
      r = { userId: id, name: nameOf.get(id) ?? "—", calls: 0, notes: 0, emails: 0, visits: 0, touches: 0, quotes: 0, quotesWon: 0, wonValue: 0, orders: 0, orderValue: 0 };
      rows.set(id, r);
    }
    return r;
  };
  for (const a of acts) if (a.userId) { const r = row(a.userId); r.calls = a.calls; r.notes = a.notes; r.emails = a.emails; r.visits = a.visits; r.touches = a.touches; }
  for (const q of qs) if (q.createdBy) { const r = row(q.createdBy); r.quotes = q.quotes; r.quotesWon = q.won; r.wonValue = Number(q.wonValue); }
  for (const o of ords) if (o.salesRepId) { const r = row(o.salesRepId); r.orders = o.orders; r.orderValue = Number(o.amount); }

  return [...rows.values()]
    .filter((r) => r.touches || r.quotes || r.orders)
    .sort((a, b) => b.wonValue + b.orderValue - (a.wonValue + a.orderValue) || b.touches - a.touches);
}

// ---- Lead-Source ROI ------------------------------------------------------

export interface LeadSourceRow {
  source: string;
  accounts: number;
  customers: number;
  revenue: number; // lifetime: historical (SAP) + current orders
  perAccount: number;
}

const SOURCE_KEY = (s: string | null) => (s && s.trim() ? s.trim() : "(unspecified)");

export async function getLeadSourceRoi(): Promise<LeadSourceRow[]> {
  const [accounts, histRev, orderRev] = await Promise.all([
    db
      .select({
        source: businessPartners.leadSource,
        accounts: sql<number>`COUNT(*)::int`,
        customers: sql<number>`COUNT(*) FILTER (WHERE ${businessPartners.lifecycleStage} = 'customer')::int`,
      })
      .from(businessPartners)
      .groupBy(businessPartners.leadSource),
    db
      .select({ source: businessPartners.leadSource, rev: sql<string>`COALESCE(SUM(${historicalOrders.docTotal}), 0)` })
      .from(historicalOrders)
      .innerJoin(businessPartners, eq(historicalOrders.bpId, businessPartners.id))
      .where(eq(historicalOrders.canceled, false))
      .groupBy(businessPartners.leadSource),
    db
      .select({ source: businessPartners.leadSource, rev: sql<string>`COALESCE(SUM(${orders.amount}), 0)` })
      .from(orders)
      .innerJoin(businessPartners, eq(orders.bpId, businessPartners.id))
      .where(isNull(orders.voidedAt))
      .groupBy(businessPartners.leadSource),
  ]);

  const map = new Map<string, LeadSourceRow>();
  const row = (s: string): LeadSourceRow => {
    let r = map.get(s);
    if (!r) { r = { source: s, accounts: 0, customers: 0, revenue: 0, perAccount: 0 }; map.set(s, r); }
    return r;
  };
  for (const a of accounts) { const r = row(SOURCE_KEY(a.source)); r.accounts += a.accounts; r.customers += a.customers; }
  for (const h of histRev) row(SOURCE_KEY(h.source)).revenue += Number(h.rev);
  for (const o of orderRev) row(SOURCE_KEY(o.source)).revenue += Number(o.rev);
  for (const r of map.values()) r.perAccount = r.accounts ? r.revenue / r.accounts : 0;

  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}
