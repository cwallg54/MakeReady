import Link from "next/link";
import { redirect } from "next/navigation";
import { requireModule } from "@/lib/auth/guards";
import { canBuildReports } from "@/lib/reports/sources";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { money0 } from "@/lib/reports/standard";
import { getRevenueTrend } from "@/lib/reports/analytics-data";
import { ChartPanel, RevenueTrendChart } from "../charts";

export const dynamic = "force-dynamic";

const RANGES = [
  { key: "12", label: "12 mo", months: 12 },
  { key: "24", label: "24 mo", months: 24 },
  { key: "36", label: "36 mo", months: 36 },
  { key: "all", label: "All time", months: null as number | null },
];

export default async function RevenueTrendPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const user = await requireModule("reports");
  if (!canBuildReports(user.roles)) redirect("/reports");
  const sp = await searchParams;
  const range = RANGES.find((r) => r.key === sp.range) ?? RANGES[1];
  const points = await getRevenueTrend(range.months);

  const total = points.reduce((s, p) => s + p.total, 0);
  const current = points.reduce((s, p) => s + p.current, 0);
  const peak = points.reduce((a, p) => (p.total > a.total ? p : a), { label: "—", total: 0 });
  const avg = points.length ? total / points.length : 0;

  return (
    <div className="max-w-5xl space-y-6">
      <Link href="/reports" className="text-sm text-neutral-500 hover:text-neutral-900">← Reports</Link>
      <PageHeader
        title="Revenue Trend"
        description="Monthly sales over time — migrated SAP history plus current orders."
        action={
          <Link href={`/reports/standard/revenue-trend/export?range=${range.key}`} className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Export CSV ↓</Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-neutral-500">Range:</span>
        {RANGES.map((r) => (
          <Link key={r.key} href={`/reports/standard/revenue-trend?range=${r.key}`} className={`rounded-md border px-3 py-1 ${range.key === r.key ? "border-brand bg-brand/15 font-medium text-brand-ink" : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"}`}>{r.label}</Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total revenue" value={money0(total) || "$0"} hint={`${points.length} months`} />
        <StatCard label="Monthly average" value={money0(avg) || "$0"} hint="Across the range" />
        <StatCard label="Best month" value={money0(peak.total) || "$0"} hint={peak.label} />
        <StatCard label="On MakeReady" value={total ? `${Math.round((current / total) * 100)}%` : "0%"} hint="vs migrated history" />
      </div>

      <ChartPanel title="Monthly revenue" subtitle="SAP history + MakeReady, stacked" height={340}>
        {points.length === 0 ? <p className="pt-8 text-center text-sm text-neutral-400">No revenue in this range.</p> : <RevenueTrendChart data={points} />}
      </ChartPanel>

      <Card className="overflow-x-auto p-0">
        <div className="border-b border-neutral-200 px-5 py-3"><h2 className="text-sm font-semibold text-neutral-900">Monthly detail</h2></div>
        <table className="w-full min-w-[480px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-neutral-400"><tr><th className="px-5 py-2">Month</th><th className="px-5 py-2 text-right">SAP history</th><th className="px-5 py-2 text-right">MakeReady</th><th className="px-5 py-2 text-right">Total</th></tr></thead>
          <tbody className="divide-y divide-neutral-100">
            {[...points].reverse().slice(0, 36).map((p) => (
              <tr key={p.month}>
                <td className="px-5 py-2 text-neutral-800">{p.label}</td>
                <td className="px-5 py-2 text-right tabular-nums text-neutral-500">{money0(p.historical) || "—"}</td>
                <td className="px-5 py-2 text-right tabular-nums text-neutral-500">{money0(p.current) || "—"}</td>
                <td className="px-5 py-2 text-right tabular-nums font-medium text-neutral-900">{money0(p.total) || "$0"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
