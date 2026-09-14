import Link from "next/link";
import { DateTime } from "luxon";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { goalsVsActual } from "@/lib/accounting/sales-goals";
import { listFiscalYears } from "@/lib/accounting/fiscal-service";
import { saveGoalsAction } from "@/lib/accounting/goal-actions";
import { PrintButton } from "@/components/accounting/print-button";

export const dynamic = "force-dynamic";
const money = (n: number) => (n === 0 ? "—" : `$${Math.round(n).toLocaleString()}`);
const moneyK = (n: number) => (n === 0 ? "—" : `$${Math.round(n / 1000).toLocaleString()}k`);

/** Attainment colour: at or above goal is good, 80%+ is close, below is behind. */
function tone(pct: number | null): string {
  if (pct === null) return "text-neutral-400";
  if (pct >= 100) return "text-emerald-600";
  if (pct >= 80) return "text-amber-600";
  return "text-red-600";
}

export default async function SalesGoalsPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string; edit?: string }>;
}) {
  const user = await requireModule("accounting");
  const editable = canEdit(user.roles, "accounting") || canEdit(user.roles, "sales");
  const sp = await searchParams;
  const editing = sp.edit === "1" && editable;

  const [data, years] = await Promise.all([
    goalsVsActual(sp.fy ? Number(sp.fy) : undefined),
    listFiscalYears(),
  ]);
  const { fiscalYear, periods, reps, totals, asOf } = data;

  const elapsedCount = totals.cells.filter((c) => c.elapsed).length;
  const yearsWithData = years.filter((y) => y.year >= 2009 && y.year <= new Date().getFullYear() + 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/accounting" className="text-sm text-neutral-500 hover:text-neutral-900">← Accounting</Link>
        <PrintButton />
      </div>
      <div className="print:hidden">
        <PageHeader
          title="Sales goals vs actual"
          description="Each rep's monthly revenue goal against what they actually booked, across the Oct–Sep fiscal year."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={`FY${fiscalYear} goal`} value={money(totals.goalTotal)} />
        <StatCard label="Booked so far" value={money(totals.actualTotal)} />
        <StatCard label={`Goal for the ${elapsedCount} months elapsed`} value={money(totals.goalToDate)} />
        <StatCard
          label="Attainment to date"
          value={totals.attainmentToDate === null ? "—" : `${totals.attainmentToDate.toFixed(0)}%`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {yearsWithData.slice(0, 8).map((y) => (
          <Link
            key={y.id}
            href={`/accounting/goals?fy=${y.year}`}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              y.year === fiscalYear
                ? "border-neutral-900 bg-neutral-900 font-semibold text-white"
                : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400"
            }`}
          >
            FY{y.year}
          </Link>
        ))}
        {editable && (
          <Link
            href={`/accounting/goals?fy=${fiscalYear}&edit=${editing ? "0" : "1"}`}
            className="ml-auto rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-semibold text-neutral-700 hover:border-neutral-400"
          >
            {editing ? "Done editing" : "Edit goals"}
          </Link>
        )}
      </div>

      <Card>
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-neutral-900">
            FY{fiscalYear} — {editing ? "setting goals" : "actual against goal, by month"}
          </h2>
          <p className="text-xs text-neutral-500">
            {editing
              ? "Type each rep's monthly goal and save. Blank or zero clears the goal for that month."
              : `Top figure is booked revenue, below it the goal and attainment. Months shaded grey have not started yet. As of ${DateTime.fromISO(asOf).toFormat("LLL d, yyyy")}.`}
          </p>
        </div>

        {reps.length === 0 ? (
          <p className="rounded-md bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-500">
            No goals or sales recorded for FY{fiscalYear}.
          </p>
        ) : (
          <form action={saveGoalsAction}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[64rem] text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
                    <th className="sticky left-0 z-10 bg-white py-2 pr-3 text-left">Rep</th>
                    {periods.map((p) => (
                      <th key={p.code} className="py-2 pr-2 text-right">
                        <span className="block font-semibold text-neutral-700">{p.name.split(" ")[0]}</span>
                        <span className="block text-[10px] font-normal text-neutral-400">{p.name.split(" ")[1]}</span>
                      </th>
                    ))}
                    <th className="py-2 pl-2 text-right text-neutral-700">Year</th>
                  </tr>
                </thead>
                <tbody>
                  {reps.map((r) => (
                    <tr key={r.repId} className="border-b border-neutral-100">
                      <td className="sticky left-0 z-10 bg-white py-2 pr-3">
                        <span className="font-medium text-neutral-900">{r.name}</span>
                        {!r.active && <span className="ml-1 text-[10px] text-neutral-400">inactive</span>}
                      </td>
                      {r.cells.map((c) => (
                        <td key={c.code} className={`py-2 pr-2 text-right ${c.elapsed ? "" : "bg-neutral-50/70"}`}>
                          {editing ? (
                            <input
                              name={`goal[${r.repId}|${c.year}|${c.month}]`}
                              defaultValue={c.goal ? String(Math.round(c.goal)) : ""}
                              inputMode="numeric"
                              placeholder="—"
                              className="w-20 rounded border border-neutral-300 px-1.5 py-1 text-right text-xs outline-none focus:border-brand"
                            />
                          ) : (
                            <>
                              <div className="tabular-nums text-neutral-900">{moneyK(c.actual)}</div>
                              <div className="text-[11px] tabular-nums text-neutral-400">
                                {c.goal ? moneyK(c.goal) : "—"}
                                {c.attainment !== null && c.elapsed && (
                                  <span className={`ml-1 ${tone(c.attainment)}`}>{c.attainment.toFixed(0)}%</span>
                                )}
                              </div>
                            </>
                          )}
                        </td>
                      ))}
                      <td className="py-2 pl-2 text-right">
                        <div className="tabular-nums font-semibold text-neutral-900">{moneyK(r.actualTotal)}</div>
                        <div className="text-[11px] tabular-nums text-neutral-400">
                          {moneyK(r.goalTotal)}
                          {r.attainmentToDate !== null && (
                            <span className={`ml-1 ${tone(r.attainmentToDate)}`}>{r.attainmentToDate.toFixed(0)}%</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-neutral-300 font-semibold">
                    <td className="sticky left-0 z-10 bg-white py-2 pr-3 text-neutral-900">Total</td>
                    {totals.cells.map((c) => (
                      <td key={c.code} className={`py-2 pr-2 text-right ${c.elapsed ? "" : "bg-neutral-50/70"}`}>
                        <div className="tabular-nums text-neutral-900">{moneyK(c.actual)}</div>
                        <div className="text-[11px] tabular-nums text-neutral-400">
                          {c.goal ? moneyK(c.goal) : "—"}
                          {c.attainment !== null && c.elapsed && (
                            <span className={`ml-1 ${tone(c.attainment)}`}>{c.attainment.toFixed(0)}%</span>
                          )}
                        </div>
                      </td>
                    ))}
                    <td className="py-2 pl-2 text-right">
                      <div className="tabular-nums text-neutral-900">{moneyK(totals.actualTotal)}</div>
                      <div className="text-[11px] tabular-nums text-neutral-400">
                        {moneyK(totals.goalTotal)}
                        {totals.attainmentToDate !== null && (
                          <span className={`ml-1 ${tone(totals.attainmentToDate)}`}>{totals.attainmentToDate.toFixed(0)}%</span>
                        )}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {editing && (
              <div className="mt-4 flex items-center gap-3">
                <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">
                  Save goals
                </button>
                <span className="text-xs text-neutral-500">Whole dollars; blank clears a month.</span>
              </div>
            )}
          </form>
        )}
      </Card>

      {!editing && reps.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Where the year stands</h2>
          <div className="space-y-1.5">
            {reps.slice(0, 12).map((r) => {
              const pct = r.attainmentToDate ?? 0;
              const width = Math.max(2, Math.min(140, pct));
              return (
                <div key={r.repId} className="flex items-center gap-3 text-sm">
                  <span className="w-44 shrink-0 truncate text-neutral-700">{r.name}</span>
                  <div className="relative h-3 flex-1 rounded-full bg-neutral-100">
                    {/* 100% sits at 5/7 of the track, so overachievement is visible */}
                    <div className="absolute inset-y-0 left-[71.4%] w-px bg-neutral-400" />
                    <div
                      className={`h-3 rounded-full ${pct >= 100 ? "bg-emerald-500" : pct >= 80 ? "bg-amber-400" : "bg-red-400"}`}
                      style={{ width: `${(width / 140) * 100}%` }}
                    />
                  </div>
                  <span className={`w-14 shrink-0 text-right text-xs font-medium tabular-nums ${tone(r.attainmentToDate)}`}>
                    {r.attainmentToDate === null ? "—" : `${r.attainmentToDate.toFixed(0)}%`}
                  </span>
                  <span className="w-24 shrink-0 text-right text-xs tabular-nums text-neutral-500">{money(r.actualTotal)}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            Measured against the goal for the months that have elapsed, not the whole year — so a rep is not shown as
            behind simply because the year is not over.
          </p>
        </Card>
      )}
    </div>
  );
}
