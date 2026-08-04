import Link from "next/link";
import { redirect } from "next/navigation";
import { requireModule } from "@/lib/auth/guards";
import { canBuildReports } from "@/lib/reports/sources";
import { PageHeader, Card } from "@/components/ui";
import { money2, ORDER_TYPE_LABEL } from "@/lib/reports/standard";
import { getTopProducts, periodSince, parsePeriod, PERIOD_LABEL, type Period } from "@/lib/reports/analytics-data";

export const dynamic = "force-dynamic";

const PERIODS: Period[] = ["30", "90", "365", "all"];

export default async function TopProductsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const user = await requireModule("reports");
  if (!canBuildReports(user.roles)) redirect("/reports");
  const sp = await searchParams;
  const period = parsePeriod(sp.period);
  const { products, byType } = await getTopProducts(periodSince(period));
  const typeTotal = byType.reduce((s, t) => s + t.amount, 0);

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/reports" className="text-sm text-neutral-500 hover:text-neutral-900">← Reports</Link>
      <PageHeader
        title="Top Products & Designs"
        description="Best-selling line items and sales by product / decoration type."
        action={
          <Link href={`/reports/standard/top-products/export?period=${period}`} className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Export CSV ↓</Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-neutral-500">Period:</span>
        {PERIODS.map((p) => (
          <Link key={p} href={`/reports/standard/top-products?period=${p}`} className={`rounded-md border px-3 py-1 ${period === p ? "border-brand bg-brand/15 font-medium text-brand-ink" : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"}`}>{PERIOD_LABEL[p]}</Link>
        ))}
      </div>

      <Card className="p-0">
        <div className="border-b border-neutral-200 px-5 py-3"><h2 className="text-sm font-semibold text-neutral-900">Top line items by quoted value</h2></div>
        {products.length === 0 ? (
          <p className="px-5 py-6 text-sm text-neutral-400">No quote line items in this period yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-neutral-400">
                <tr><th className="px-5 py-2">Product / line</th><th className="px-5 py-2 text-right">Qty</th><th className="px-5 py-2 text-right">Quotes</th><th className="px-5 py-2 text-right">Quoted $</th><th className="px-5 py-2 text-right">Won $</th></tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {products.map((p, i) => (
                  <tr key={i}>
                    <td className="px-5 py-2 text-neutral-800">{p.description}</td>
                    <td className="px-5 py-2 text-right tabular-nums text-neutral-600">{p.qty.toLocaleString()}</td>
                    <td className="px-5 py-2 text-right tabular-nums text-neutral-500">{p.quotes}</td>
                    <td className="px-5 py-2 text-right tabular-nums text-neutral-800">{money2(p.revenue)}</td>
                    <td className="px-5 py-2 text-right tabular-nums font-medium text-neutral-900">{money2(p.wonRevenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-0">
        <div className="border-b border-neutral-200 px-5 py-3"><h2 className="text-sm font-semibold text-neutral-900">Sales by product / decoration type</h2></div>
        {byType.length === 0 ? (
          <p className="px-5 py-6 text-sm text-neutral-400">No orders in this period yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-neutral-400"><tr><th className="px-5 py-2">Type</th><th className="px-5 py-2 text-right">Orders</th><th className="px-5 py-2 text-right">Amount</th><th className="px-5 py-2 text-right">Share</th></tr></thead>
            <tbody className="divide-y divide-neutral-100">
              {byType.map((t, i) => (
                <tr key={i}>
                  <td className="px-5 py-2 text-neutral-800">{t.orderType ? (ORDER_TYPE_LABEL[t.orderType] ?? t.orderType) : "Unspecified"}</td>
                  <td className="px-5 py-2 text-right tabular-nums text-neutral-500">{t.orders}</td>
                  <td className="px-5 py-2 text-right tabular-nums font-medium text-neutral-900">{money2(t.amount)}</td>
                  <td className="px-5 py-2 text-right tabular-nums text-neutral-500">{typeTotal ? Math.round((t.amount / typeTotal) * 100) : 0}%</td>
                </tr>
              ))}
              <tr className="border-t border-neutral-200"><td className="px-5 py-2 text-right text-xs font-semibold text-neutral-700" colSpan={2}>Total</td><td className="px-5 py-2 text-right text-xs font-semibold tabular-nums text-neutral-900">{money2(typeTotal)}</td><td /></tr>
            </tbody>
          </table>
        )}
      </Card>

      <p className="text-xs text-neutral-400">Line-item detail comes from quotes (the record that carries product + price); order-type totals come from sales orders.</p>
    </div>
  );
}
