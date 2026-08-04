import Link from "next/link";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { inventoryItems, stockMovements } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 365;

export default async function ForecastPage() {
  await requireModule("inventory");
  const now = new Date();
  const cutoff = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);

  // Usage over the trailing year = total consumed per item (consume movements).
  const usageRows = await db
    .select({ itemId: stockMovements.itemId, consumed: sql<string>`COALESCE(SUM(-${stockMovements.delta}), 0)` })
    .from(stockMovements)
    .where(and(eq(stockMovements.reason, "consume"), gte(stockMovements.createdAt, cutoff)))
    .groupBy(stockMovements.itemId);
  const consumedBy = new Map(usageRows.map((r) => [r.itemId, Number(r.consumed)]));
  const ids = usageRows.map((r) => r.itemId).filter((id) => (consumedBy.get(id) ?? 0) > 0);

  const items = ids.length
    ? await db.select().from(inventoryItems).where(and(inArray(inventoryItems.id, ids), eq(inventoryItems.active, true)))
    : [];

  const rows = items
    .map((i) => {
      const consumed = consumedBy.get(i.id) ?? 0;
      const avgDaily = consumed / WINDOW_DAYS;
      const onHand = Number(i.onHand);
      const lead = i.leadTimeDays || 30;
      const projectedNeed = avgDaily * lead; // usage expected during the lead time
      const daysOfStock = avgDaily > 0 ? onHand / avgDaily : Infinity;
      const suggested = Math.max(0, Math.ceil(projectedNeed - onHand));
      return { i, consumed, avgDaily, onHand, lead, projectedNeed, daysOfStock, suggested };
    })
    // Surface items that will run out within their lead time (won't reorder in time).
    .filter((r) => r.daysOfStock < r.lead || r.suggested > 0)
    .sort((a, b) => a.daysOfStock - b.daysOfStock);

  const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const suggestedSpend = rows.reduce((s, r) => s + r.suggested * Number(r.i.cost), 0);

  return (
    <div className="max-w-5xl space-y-6">
      <Link href="/inventory" className="text-sm text-neutral-500 hover:text-neutral-900">← Inventory</Link>
      <PageHeader title="Reorder forecast" description="Items projected to run out within their lead time, with a suggested order quantity — based on the last 12 months of usage." />

      <Card className="p-0 overflow-x-auto">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-neutral-900">Suggested reorders ({rows.length})</h2>
          {rows.length > 0 && <span className="text-xs text-neutral-500">Est. spend {money(suggestedSpend)}</span>}
        </div>
        <table className="w-full min-w-[820px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-neutral-400">
            <tr>
              <th className="px-4 py-2">Item</th><th className="px-4 py-2">Territory</th><th className="px-4 py-2 text-right">On hand</th>
              <th className="px-4 py-2 text-right">Yr usage</th><th className="px-4 py-2 text-right">Lead</th><th className="px-4 py-2 text-right">Days left</th><th className="px-4 py-2 text-right">Suggest order</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-neutral-400">Nothing forecast to run short. 🎉 (needs consumption history to forecast)</td></tr>}
            {rows.map((r) => {
              const urgent = r.daysOfStock < r.lead;
              return (
                <tr key={r.i.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-2"><Link href={`/inventory/${r.i.id}`} className="font-medium text-neutral-900 hover:underline">{r.i.name}</Link> <span className="font-mono text-[11px] text-neutral-400">{r.i.sku}</span>{r.i.isImport && <span className="ml-1 rounded bg-blue-50 px-1 text-[10px] text-brand-ink">import</span>}</td>
                  <td className="px-4 py-2 text-neutral-500">{r.i.territory ?? "—"}</td>
                  <td className="px-4 py-2 text-right text-neutral-700">{r.onHand} {r.i.unit}</td>
                  <td className="px-4 py-2 text-right text-neutral-500">{Math.round(r.consumed)}</td>
                  <td className="px-4 py-2 text-right text-neutral-500">{r.lead}d</td>
                  <td className={`px-4 py-2 text-right font-medium ${urgent ? "text-red-600" : "text-neutral-600"}`}>{r.daysOfStock === Infinity ? "—" : `${Math.round(r.daysOfStock)}d`}</td>
                  <td className="px-4 py-2 text-right font-semibold text-neutral-900">{r.suggested} {r.i.unit}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-neutral-400">Suggested order ≈ (projected usage during the lead time) − on hand. Usage is measured from “consume” stock movements over the last {WINDOW_DAYS} days, so accuracy grows as MakeReady records more picking activity.</p>
    </div>
  );
}
