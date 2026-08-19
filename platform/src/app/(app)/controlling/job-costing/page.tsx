import Link from "next/link";
import { requireModule } from "@/lib/auth/guards";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { jobProfitability } from "@/lib/controlling/costing";

export const dynamic = "force-dynamic";
const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

export default async function JobCostingPage() {
  await requireModule("controlling");
  const jobs = await jobProfitability(200);
  const costed = jobs.filter((j) => j.cost > 0);
  const revenue = costed.reduce((s, j) => s + j.revenue, 0);
  const cost = costed.reduce((s, j) => s + j.cost, 0);
  const margin = revenue - cost;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Job costing" description="True order profitability from actual captured job costs (labor, material, machine) — not a company-average estimate. Capture costs on each production job." />
        <div className="flex items-center gap-3">
          <a href="/controlling/job-costing/export" className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Export CSV</a>
          <Link href="/controlling" className="text-sm text-neutral-500 hover:underline">← Controlling</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Costed jobs" value={costed.length} hint={`${jobs.length} total jobs`} />
        <StatCard label="Revenue (costed)" value={money(revenue)} />
        <StatCard label="Actual cost" value={money(cost)} />
        <StatCard label="Margin" value={money(margin)} hint={revenue ? pct(margin / revenue) : "—"} />
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-neutral-400">
            <tr><th className="py-1">Order</th><th className="py-1">Customer</th><th className="py-1">Status</th><th className="py-1 text-right">Revenue</th><th className="py-1 text-right">Cost</th><th className="py-1 text-right">Margin</th><th className="py-1 text-right">%</th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {jobs.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-neutral-400">No production jobs yet.</td></tr>}
            {jobs.map((j) => (
              <tr key={j.jobId} className="hover:bg-neutral-50">
                <td className="py-1.5"><Link href={`/production/${j.jobId}`} className="font-medium text-neutral-900 hover:underline">{j.orderNumber ?? "—"}</Link></td>
                <td className="py-1.5 text-neutral-600">{j.customer ?? "—"}</td>
                <td className="py-1.5 text-neutral-500">{j.status.replace(/_/g, " ")}</td>
                <td className="py-1.5 text-right text-neutral-700">{money(j.revenue)}</td>
                <td className="py-1.5 text-right text-neutral-700">{j.cost > 0 ? money(j.cost) : <span className="text-neutral-300">—</span>}</td>
                <td className={`py-1.5 text-right font-medium ${j.cost > 0 ? (j.margin >= 0 ? "text-emerald-700" : "text-red-600") : "text-neutral-300"}`}>{j.cost > 0 ? money(j.margin) : "—"}</td>
                <td className="py-1.5 text-right text-neutral-500">{j.cost > 0 ? pct(j.marginPct) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
