import Link from "next/link";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, StatCard } from "@/components/ui";
import { listAssets, assetSummary } from "@/lib/assets/data";

export const dynamic = "force-dynamic";
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

const STATUS_STYLE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  fully_depreciated: "bg-amber-100 text-amber-700",
  disposed: "bg-neutral-200 text-neutral-600",
};

export default async function AssetsPage() {
  const user = await requireModule("accounting");
  const canDo = canEdit(user.roles, "accounting");
  const [assets, summary] = await Promise.all([listAssets(), assetSummary()]);

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Fixed assets" description="The capital asset register — cost, accumulated depreciation, and net book value, with monthly straight-line depreciation posted to the GL." />
        <div className="flex gap-2">
          <a href="/accounting/assets/export" className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Export CSV</a>
          <Link href="/accounting/assets/depreciation" className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Depreciation runs</Link>
          {canDo && <Link href="/accounting/assets/new" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">New asset</Link>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Asset cost" value={money(summary.cost)} hint={`${summary.activeCount} active assets`} />
        <StatCard label="Accumulated depreciation" value={money(summary.accum)} hint="Booked to date" />
        <StatCard label="Net book value" value={money(summary.nbv)} hint="Cost − accumulated" />
        <StatCard label="Disposed" value={summary.disposedCount} hint="Removed from the register" />
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-400">
            <tr>
              <th className="px-3 py-2">Asset</th><th className="px-3 py-2">Category</th>
              <th className="px-3 py-2 text-right">Cost</th><th className="px-3 py-2 text-right">Accum.</th>
              <th className="px-3 py-2 text-right">Net book</th><th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {assets.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-neutral-400">No assets yet. Add the equipment you want to depreciate.</td></tr>}
            {assets.map((a) => (
              <tr key={a.id} className="hover:bg-neutral-50">
                <td className="px-3 py-2">
                  <Link href={`/accounting/assets/${a.id}`} className="font-medium text-neutral-900 hover:underline">{a.name}</Link>
                  <span className="ml-2 text-xs text-neutral-400">{a.assetNumber}</span>
                </td>
                <td className="px-3 py-2 capitalize text-neutral-600">{a.category}</td>
                <td className="px-3 py-2 text-right text-neutral-700">{money(Number(a.cost))}</td>
                <td className="px-3 py-2 text-right text-neutral-500">{money(a.calc.accumulated)}</td>
                <td className="px-3 py-2 text-right font-medium text-neutral-900">{money(a.calc.netBookValue)}</td>
                <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[a.status] ?? "bg-neutral-100 text-neutral-600"}`}>{a.status.replace("_", " ")}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
