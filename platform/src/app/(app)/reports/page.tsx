import Link from "next/link";
import { and, asc, desc, eq, gt, isNull, sql, count } from "drizzle-orm";
import { db } from "@/db";
import { businessPartners, quotes, orders, productionJobs, inventoryItems } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { PageHeader, Card, StatCard } from "@/components/ui";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const ORDER_STAGE_LABEL: Record<string, string> = { received: "Received", art_proof: "Art & Proof", production: "Production", quality: "Quality", shipped: "Shipped", delivered: "Delivered" };
const PROD_LABEL: Record<string, string> = { queued: "Queued", in_production: "In production", quality_check: "Quality check", ready_to_ship: "Ready to ship", shipped: "Shipped" };
const QUOTE_LABEL: Record<string, string> = { draft: "Draft", sent: "Sent", accepted: "Accepted", rejected: "Rejected", converted: "Converted" };

export default async function ReportsPage() {
  await requireModule("reports");

  const [pipeline, quotesAgg, ordersByStage, prodByStatus, invAgg, invByCategory, lowStock, topCustomers] = await Promise.all([
    db.select({ stage: businessPartners.lifecycleStage, n: count() }).from(businessPartners).groupBy(businessPartners.lifecycleStage),
    db.select({ status: quotes.status, n: count(), total: sql<string>`COALESCE(SUM(${quotes.total}),0)` }).from(quotes).groupBy(quotes.status),
    db.select({ stage: orders.stage, n: count() }).from(orders).where(isNull(orders.voidedAt)).groupBy(orders.stage),
    db.select({ status: productionJobs.status, n: count() }).from(productionJobs).groupBy(productionJobs.status),
    db.select({ items: count(), value: sql<string>`COALESCE(SUM(${inventoryItems.cost} * ${inventoryItems.onHand}),0)`, units: sql<string>`COALESCE(SUM(${inventoryItems.onHand}),0)` }).from(inventoryItems),
    db.select({ category: inventoryItems.category, value: sql<string>`COALESCE(SUM(${inventoryItems.cost} * ${inventoryItems.onHand}),0)`, items: count() }).from(inventoryItems).groupBy(inventoryItems.category).orderBy(desc(sql`COALESCE(SUM(${inventoryItems.cost} * ${inventoryItems.onHand}),0)`)).limit(10),
    db.select({ sku: inventoryItems.sku, name: inventoryItems.name, onHand: inventoryItems.onHand, reorderPoint: inventoryItems.reorderPoint, unit: inventoryItems.unit }).from(inventoryItems).where(and(gt(inventoryItems.reorderPoint, "0"), sql`${inventoryItems.onHand} <= ${inventoryItems.reorderPoint}`)).orderBy(asc(inventoryItems.name)).limit(15),
    db.select({ company: businessPartners.companyName, total: sql<string>`COALESCE(SUM(${quotes.total}),0)`, quotes: count() }).from(quotes).innerJoin(businessPartners, eq(quotes.bpId, businessPartners.id)).groupBy(businessPartners.companyName).orderBy(desc(sql`COALESCE(SUM(${quotes.total}),0)`)).limit(10),
  ]);

  const stageN = (s: string) => pipeline.find((r) => r.stage === s)?.n ?? 0;
  const totalQuotes = quotesAgg.reduce((s, r) => s + r.n, 0);
  const wonQuotes = quotesAgg.filter((r) => r.status === "accepted" || r.status === "converted").reduce((s, r) => s + r.n, 0);
  const openValue = quotesAgg.filter((r) => r.status === "draft" || r.status === "sent").reduce((s, r) => s + Number(r.total), 0);
  const wonValue = quotesAgg.filter((r) => r.status === "accepted" || r.status === "converted").reduce((s, r) => s + Number(r.total), 0);
  const conv = totalQuotes ? Math.round((wonQuotes / totalQuotes) * 100) : 0;
  const activeOrders = ordersByStage.filter((r) => r.stage !== "delivered").reduce((s, r) => s + r.n, 0);
  const jobsOpen = prodByStatus.filter((r) => r.status !== "shipped").reduce((s, r) => s + r.n, 0);
  const invValue = Number(invAgg[0]?.value ?? 0);
  const invItems = invAgg[0]?.items ?? 0;
  const lowCountRow = await db.select({ n: count() }).from(inventoryItems).where(and(gt(inventoryItems.reorderPoint, "0"), sql`${inventoryItems.onHand} <= ${inventoryItems.reorderPoint}`));
  const lowCount = lowCountRow[0]?.n ?? 0;

  const Breakdown = ({ title, rows }: { title: string; rows: { label: string; value: string }[] }) => (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-neutral-900">{title}</h2>
      {rows.length === 0 ? <p className="text-xs text-neutral-400">No data yet.</p> : (
        <ul className="space-y-1.5 text-sm">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between">
              <span className="text-neutral-600">{r.label}</span>
              <span className="font-medium text-neutral-900">{r.value}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader title="Reports" description="Live snapshot across sales, operations, and inventory." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Customers" value={stageN("customer").toLocaleString()} hint="Active accounts" />
        <StatCard label="Active pipeline" value={(stageN("lead") + stageN("prospect")).toLocaleString()} hint="Leads + prospects" />
        <StatCard label="Quote win rate" value={`${conv}%`} hint={`${wonQuotes} of ${totalQuotes} quotes`} />
        <StatCard label="Won value" value={money(wonValue)} hint="Accepted + converted" />
        <StatCard label="Open quote value" value={money(openValue)} hint="Draft + sent" />
        <StatCard label="Active orders" value={activeOrders.toLocaleString()} hint="Not yet delivered" />
        <StatCard label="Jobs in production" value={jobsOpen.toLocaleString()} hint="Open production jobs" />
        <StatCard label="Inventory value" value={money(invValue)} hint={`${invItems.toLocaleString()} items · ${lowCount} low`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Breakdown title="Pipeline" rows={[{ label: "Leads", value: String(stageN("lead")) }, { label: "Prospects", value: String(stageN("prospect")) }, { label: "Customers", value: stageN("customer").toLocaleString() }]} />
        <Breakdown title="Quotes by status" rows={quotesAgg.map((r) => ({ label: QUOTE_LABEL[r.status] ?? r.status, value: `${r.n} · ${money(Number(r.total))}` }))} />
        <Breakdown title="Orders by stage" rows={ordersByStage.map((r) => ({ label: ORDER_STAGE_LABEL[r.stage] ?? r.stage, value: String(r.n) }))} />
        <Breakdown title="Production by status" rows={prodByStatus.map((r) => ({ label: PROD_LABEL[r.status] ?? r.status, value: String(r.n) }))} />
        <Breakdown title="Inventory value by category" rows={invByCategory.map((r) => ({ label: r.category ?? "(uncategorized)", value: money(Number(r.value)) }))} />
        <Breakdown title="Top customers by quoted value" rows={topCustomers.map((r) => ({ label: r.company, value: money(Number(r.total)) }))} />
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">Low stock ({lowCount})</h2>
          <Link href="/reports/export?d=low-stock" className="text-xs font-medium text-blue-600 hover:text-blue-800">Export CSV ↓</Link>
        </div>
        {lowStock.length === 0 ? <p className="text-xs text-neutral-400">Nothing at or below its reorder point.</p> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-neutral-400"><tr><th className="py-1">SKU</th><th className="py-1">Item</th><th className="py-1 text-right">On hand</th><th className="py-1 text-right">Reorder</th></tr></thead>
            <tbody className="divide-y divide-neutral-100">
              {lowStock.map((r) => (
                <tr key={r.sku}>
                  <td className="py-1.5 font-mono text-xs text-neutral-500">{r.sku}</td>
                  <td className="py-1.5 text-neutral-800">{r.name}</td>
                  <td className="py-1.5 text-right font-medium text-amber-600">{Number(r.onHand)} {r.unit}</td>
                  <td className="py-1.5 text-right text-neutral-500">{Number(r.reorderPoint)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/reports/export?d=inventory" className="rounded-md border border-neutral-300 bg-white px-4 py-2 font-medium text-neutral-700 hover:bg-neutral-50">Export inventory valuation (CSV)</Link>
        <Link href="/reports/export?d=top-customers" className="rounded-md border border-neutral-300 bg-white px-4 py-2 font-medium text-neutral-700 hover:bg-neutral-50">Export top customers (CSV)</Link>
      </div>
    </div>
  );
}
