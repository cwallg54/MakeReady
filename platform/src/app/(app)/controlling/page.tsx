import Link from "next/link";
import { DateTime } from "luxon";
import { requireModule } from "@/lib/auth/guards";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { companyMargins } from "@/lib/controlling/data";

export const dynamic = "force-dynamic";
const TZ = "America/Denver";
const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export default async function ControllingHome() {
  await requireModule("controlling");
  const now = DateTime.now().setZone(TZ);
  const from = now.startOf("year").toJSDate();
  const m = await companyMargins(from, now.toJSDate());

  return (
    <div className="max-w-5xl space-y-8">
      <PageHeader title="Controlling" description="Management accounting — margins, profitability, and budget vs. actual, on top of the general ledger." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Revenue (YTD)" value={money(m.revenue)} hint="This calendar year" />
        <StatCard label="Gross margin" value={pct(m.grossMarginPct)} hint={`${money(m.grossProfit)} gross profit`} />
        <StatCard label="Net margin" value={pct(m.netMarginPct)} hint={`${money(m.netIncome)} net income`} />
        <StatCard label="Operating expenses" value={money(m.operating)} hint="Below gross profit" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/controlling/profitability" className="group rounded-xl border border-neutral-200 bg-white p-5 transition hover:border-neutral-300 hover:shadow-sm">
          <span className="text-sm font-semibold text-neutral-900 group-hover:text-brand-ink">Profitability →</span>
          <p className="mt-1 text-xs text-neutral-500">Revenue and estimated gross profit by customer and by salesperson.</p>
        </Link>
        <Link href="/controlling/budget" className="group rounded-xl border border-neutral-200 bg-white p-5 transition hover:border-neutral-300 hover:shadow-sm">
          <span className="text-sm font-semibold text-neutral-900 group-hover:text-brand-ink">Budget vs. Actual →</span>
          <p className="mt-1 text-xs text-neutral-500">Set an annual budget per account and track the variance against actuals.</p>
        </Link>
      </div>

      <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-500">
        <span className="font-semibold text-neutral-600">Note:</span> profit by customer/rep applies the company-average gross margin ({pct(m.grossMarginPct)}) to each one&apos;s revenue, since per-order cost isn&apos;t tracked yet. As real bills/COGS land in the ledger, the company margin — and these estimates — become more precise. Cost centers and per-job costing are the next layer.
      </div>
    </div>
  );
}
