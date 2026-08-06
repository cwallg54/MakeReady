import Link from "next/link";
import { requireModule } from "@/lib/auth/guards";
import { Card, PageHeader } from "@/components/ui";
import { computeReorders } from "@/lib/inventory/reorder";

export const dynamic = "force-dynamic";

export default async function ForecastPage() {
  await requireModule("inventory");
  const rows = await computeReorders(new Date());

  const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const suggestedSpend = rows.reduce((s, r) => s + r.suggested * Number(r.item.cost), 0);

  return (
    <div className="max-w-5xl space-y-6">
      <Link href="/inventory" className="text-sm text-neutral-500 hover:text-neutral-900">← Inventory</Link>
      <PageHeader title="Reorder forecast" description="Items at or below their reorder point, or projected to run out within their lead time — with a suggested order quantity." />

      <Card className="p-0 overflow-x-auto">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-neutral-900">Needs reordering ({rows.length})</h2>
          {rows.length > 0 && <span className="text-xs text-neutral-500">Est. spend {money(suggestedSpend)}</span>}
        </div>
        <table className="w-full min-w-[880px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-neutral-400">
            <tr>
              <th className="px-4 py-2">Item</th><th className="px-4 py-2">Why</th><th className="px-4 py-2">Territory</th><th className="px-4 py-2 text-right">On hand</th>
              <th className="px-4 py-2 text-right">Reorder pt</th><th className="px-4 py-2 text-right">Yr usage</th><th className="px-4 py-2 text-right">Lead</th><th className="px-4 py-2 text-right">Days left</th><th className="px-4 py-2 text-right">Suggest order</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.length === 0 && <tr><td colSpan={9} className="px-4 py-6 text-center text-neutral-400">Nothing to reorder right now. 🎉</td></tr>}
            {rows.map((r) => {
              const urgent = r.daysOfStock < r.lead;
              return (
                <tr key={r.item.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-2"><Link href={`/inventory/${r.item.id}`} className="font-medium text-neutral-900 hover:underline">{r.item.name}</Link> <span className="font-mono text-[11px] text-neutral-400">{r.item.sku}</span>{r.item.isImport && <span className="ml-1 rounded bg-blue-50 px-1 text-[10px] text-brand-ink">import</span>}</td>
                  <td className="px-4 py-2">
                    {r.reason === "low"
                      ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">Low stock</span>
                      : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Forecast</span>}
                  </td>
                  <td className="px-4 py-2 text-neutral-500">{r.item.territory ?? "—"}</td>
                  <td className="px-4 py-2 text-right text-neutral-700">{r.onHand} {r.item.unit}</td>
                  <td className="px-4 py-2 text-right text-neutral-500">{Number(r.item.reorderPoint) || "—"}</td>
                  <td className="px-4 py-2 text-right text-neutral-500">{Math.round(r.consumed)}</td>
                  <td className="px-4 py-2 text-right text-neutral-500">{r.lead}d</td>
                  <td className={`px-4 py-2 text-right font-medium ${urgent ? "text-red-600" : "text-neutral-600"}`}>{r.daysOfStock === Infinity ? "—" : `${Math.round(r.daysOfStock)}d`}</td>
                  <td className="px-4 py-2 text-right font-semibold text-neutral-900">{r.suggested} {r.item.unit}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-neutral-400">&ldquo;Low stock&rdquo; = on hand at or below the reorder point. &ldquo;Forecast&rdquo; = projected to run out within the lead time based on the last 12 months of &ldquo;consume&rdquo; movements. Suggested order ≈ (lead-time usage) − on hand. A daily job also drops these into your notifications.</p>
    </div>
  );
}
