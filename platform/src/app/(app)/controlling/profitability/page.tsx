import Link from "next/link";
import { DateTime } from "luxon";
import { requireModule } from "@/lib/auth/guards";
import { PageHeader, Card } from "@/components/ui";
import { companyMargins, profitByCustomer, profitBySalesperson, type ProfitRow } from "@/lib/controlling/data";

export const dynamic = "force-dynamic";
const TZ = "America/Denver";
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function ProfitTable({ title, dim, rows }: { title: string; dim: string; rows: ProfitRow[] }) {
  return (
    <Card className="p-0">
      <div className="border-b border-neutral-200 px-5 py-3"><h2 className="text-sm font-semibold text-neutral-900">{title}</h2></div>
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-400">
          <tr><th className="px-4 py-2">{dim}</th><th className="px-4 py-2 text-right">Revenue</th><th className="px-4 py-2 text-right">Est. gross profit</th><th className="px-4 py-2 text-right">Margin</th></tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-neutral-400">No revenue in this period.</td></tr>}
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-neutral-50">
              <td className="px-4 py-2 text-neutral-800">{r.name}</td>
              <td className="px-4 py-2 text-right tabular-nums text-neutral-700">{money(r.revenue)}</td>
              <td className="px-4 py-2 text-right tabular-nums font-medium text-emerald-700">{money(r.grossProfit)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-neutral-500">{pct(r.marginPct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export default async function ProfitabilityPage() {
  await requireModule("controlling");
  const now = DateTime.now().setZone(TZ);
  const from = now.startOf("year").toJSDate();
  const to = now.toJSDate();
  const m = await companyMargins(from, to);
  const [byCustomer, bySalesperson] = await Promise.all([
    profitByCustomer(from, m.grossMarginPct),
    profitBySalesperson(from, m.grossMarginPct),
  ]);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="text-sm"><Link href="/controlling" className="text-neutral-500 hover:text-neutral-900">← Controlling</Link></div>
      <PageHeader title="Profitability" description={`Revenue this year with estimated gross profit at the company margin (${pct(m.grossMarginPct)}).`} />
      <ProfitTable title="Top customers" dim="Customer" rows={byCustomer} />
      <ProfitTable title="By salesperson" dim="Salesperson" rows={bySalesperson} />
      <p className="text-xs text-neutral-400">Gross profit is estimated by applying the company-wide gross margin to each one&apos;s revenue; it sharpens as real product costs enter the ledger.</p>
    </div>
  );
}
