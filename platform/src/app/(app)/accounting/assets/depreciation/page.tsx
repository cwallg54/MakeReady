import Link from "next/link";
import { DateTime } from "luxon";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { listDepreciationRuns } from "@/lib/assets/data";
import { previewDepreciation } from "@/lib/assets/depreciation";
import { runDepreciationAction } from "@/lib/assets/actions";

export const dynamic = "force-dynamic";
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function DepreciationPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const user = await requireModule("accounting");
  const canDo = canEdit(user.roles, "accounting");
  const sp = await searchParams;
  const period = sp.period && /^\d{4}-\d{2}$/.test(sp.period) ? sp.period : DateTime.now().toFormat("yyyy-MM");
  const [runs, preview] = await Promise.all([listDepreciationRuns(), previewDepreciation(period)]);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Depreciation runs" description="Post one month of straight-line depreciation across every active asset. One run per period; each posts Dr Depreciation Expense / Cr Accumulated Depreciation." />
        <Link href="/accounting/assets" className="text-sm text-neutral-500 hover:underline">← Assets</Link>
      </div>

      <Card>
        <h2 className="text-sm font-semibold text-neutral-900">Run a period</h2>
        <form method="GET" className="mt-3 flex items-end gap-3">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-neutral-500">Period</label>
            <input name="period" type="month" defaultValue={period} className="mt-1 rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          </div>
          <button className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Preview</button>
        </form>

        <div className="mt-4 rounded-lg border border-neutral-200">
          <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2 text-sm">
            <span className="text-neutral-500">{preview.lines.length} asset(s) · {period}</span>
            <span className="font-semibold text-neutral-900">{money(preview.total)}</span>
          </div>
          {preview.lines.length === 0 ? (
            <p className="px-3 py-4 text-sm text-neutral-400">No depreciation due for this period.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-neutral-100">
                {preview.lines.map((l) => (
                  <tr key={l.asset.id}>
                    <td className="px-3 py-1.5 text-neutral-700">{l.asset.name} <span className="text-xs text-neutral-400">{l.asset.assetNumber}</span></td>
                    <td className="px-3 py-1.5 text-right text-neutral-700">{money(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {preview.already ? (
          <p className="mt-3 text-sm text-emerald-700">✓ {period} has already been posted.</p>
        ) : canDo && preview.total > 0 ? (
          <form action={runDepreciationAction} className="mt-3">
            <input type="hidden" name="periodYm" value={period} />
            <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Post depreciation for {period}</button>
          </form>
        ) : null}
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-neutral-900">Posted runs</h2>
        {runs.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">No depreciation runs yet.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-neutral-400">
              <tr><th className="py-1">Run</th><th className="py-1">Period</th><th className="py-1 text-right">Amount</th><th className="py-1">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="py-1.5 text-neutral-700">{r.runNumber}</td>
                  <td className="py-1.5 text-neutral-600">{r.periodYm}</td>
                  <td className="py-1.5 text-right text-neutral-700">{money(Number(r.totalAmount))}</td>
                  <td className="py-1.5"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.status === "posted" ? "bg-emerald-100 text-emerald-700" : "bg-neutral-200 text-neutral-600"}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
