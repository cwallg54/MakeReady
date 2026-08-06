import Link from "next/link";
import { DateTime } from "luxon";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { budgetVsActual, plAccountsWithBudget } from "@/lib/controlling/data";
import { saveBudgetsAction } from "@/lib/controlling/actions";

export const dynamic = "force-dynamic";
const TZ = "America/Denver";
const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`;
const inp = "w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-right tabular-nums outline-none focus:border-brand";

export default async function BudgetPage({ searchParams }: { searchParams: Promise<{ year?: string; ok?: string }> }) {
  const user = await requireModule("controlling");
  const editable = canEdit(user.roles, "controlling");
  const sp = await searchParams;
  const now = DateTime.now().setZone(TZ);
  const year = Number(sp.year) || now.year;
  const from = DateTime.fromObject({ year }, { zone: TZ }).startOf("year").toJSDate();
  const to = year === now.year ? now.toJSDate() : DateTime.fromObject({ year }, { zone: TZ }).endOf("year").toJSDate();

  const rows = await budgetVsActual(year, from, to);
  const accounts = await plAccountsWithBudget(year);

  const totBudget = rows.reduce((s, r) => s + r.budget, 0);
  const totActual = rows.reduce((s, r) => s + r.actual, 0);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="text-sm"><Link href="/controlling" className="text-neutral-500 hover:text-neutral-900">← Controlling</Link></div>
      <PageHeader title="Budget vs. Actual" description={`Annual budget against actual postings for ${year}.`} />

      {sp.ok && <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">Budget saved.</div>}

      <Card>
        <form method="get" className="flex items-end gap-2">
          <label><span className="mb-1 block text-xs font-medium text-neutral-600">Year</span><input name="year" type="number" defaultValue={year} className="w-28 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand" /></label>
          <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">View</button>
        </form>
      </Card>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-400">
            <tr><th className="px-4 py-2">Account</th><th className="px-4 py-2 text-right">Budget</th><th className="px-4 py-2 text-right">Actual</th><th className="px-4 py-2 text-right">Variance</th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.filter((r) => r.budget !== 0 || r.actual !== 0).length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-neutral-400">No budget or activity yet — set budgets below.</td></tr>}
            {rows.filter((r) => r.budget !== 0 || r.actual !== 0).map((r) => (
              <tr key={r.accountId} className="hover:bg-neutral-50">
                <td className="px-4 py-2"><span className="font-mono text-neutral-500">{r.code}</span> <span className="text-neutral-800">{r.name}</span></td>
                <td className="px-4 py-2 text-right tabular-nums text-neutral-600">{money(r.budget)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-neutral-900">{money(r.actual)}</td>
                <td className={`px-4 py-2 text-right tabular-nums font-medium ${r.variance >= 0 ? "text-emerald-700" : "text-red-600"}`}>{r.variance >= 0 ? "" : "("}{money(Math.abs(r.variance))}{r.variance >= 0 ? "" : ")"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-neutral-200 bg-neutral-50 font-semibold"><td className="px-4 py-2">Total</td><td className="px-4 py-2 text-right tabular-nums">{money(totBudget)}</td><td className="px-4 py-2 text-right tabular-nums">{money(totActual)}</td><td></td></tr>
          </tfoot>
        </table>
      </Card>
      <p className="text-xs text-neutral-400">Variance is favourable (green) when revenue beats budget or an expense stays under it.</p>

      {editable && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Set {year} budget</h2>
          <form action={saveBudgetsAction} className="space-y-2">
            <input type="hidden" name="year" value={year} />
            <div className="grid gap-2">
              {accounts.map((a) => (
                <div key={a.id} className="flex items-center gap-3">
                  <input type="hidden" name="accountId" value={a.id} />
                  <span className="flex-1 text-sm text-neutral-700"><span className="font-mono text-neutral-400">{a.code}</span> {a.name} <span className="text-[10px] uppercase text-neutral-400">{a.type}</span></span>
                  <input name="amount" type="number" step="0.01" min="0" defaultValue={a.budget || ""} placeholder="0.00" className={`w-40 ${inp}`} />
                </div>
              ))}
            </div>
            <button className="mt-2 rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Save budget</button>
          </form>
        </Card>
      )}
    </div>
  );
}
