import Link from "next/link";
import { redirect } from "next/navigation";
import { requireModule } from "@/lib/auth/guards";
import { canBuildReports } from "@/lib/reports/sources";
import { PageHeader, Card } from "@/components/ui";
import { money2 } from "@/lib/reports/standard";
import { getRepActivity, periodSince, parsePeriod, PERIOD_LABEL, type Period } from "@/lib/reports/analytics-data";
import { ChartPanel, GroupedBars, HBars } from "../charts";

export const dynamic = "force-dynamic";

const PERIODS: Period[] = ["30", "90", "365", "all"];

export default async function RepActivityPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const user = await requireModule("reports");
  if (!canBuildReports(user.roles)) redirect("/reports");
  const sp = await searchParams;
  const period = parsePeriod(sp.period);
  const rows = await getRepActivity(periodSince(period));

  const tot = rows.reduce(
    (a, r) => ({ touches: a.touches + r.touches, quotes: a.quotes + r.quotes, won: a.won + r.quotesWon, wonValue: a.wonValue + r.wonValue, orders: a.orders + r.orders, orderValue: a.orderValue + r.orderValue }),
    { touches: 0, quotes: 0, won: 0, wonValue: 0, orders: 0, orderValue: 0 },
  );

  return (
    <div className="max-w-full space-y-6">
      <Link href="/reports" className="text-sm text-neutral-500 hover:text-neutral-900">← Reports</Link>
      <PageHeader
        title="Sales-Rep Activity"
        description="Logged activity, quotes, and orders per sales rep."
        action={
          <Link href={`/reports/standard/rep-activity/export?period=${period}`} className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Export CSV ↓</Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-neutral-500">Period:</span>
        {PERIODS.map((p) => (
          <Link key={p} href={`/reports/standard/rep-activity?period=${p}`} className={`rounded-md border px-3 py-1 ${period === p ? "border-brand bg-brand/15 font-medium text-brand-ink" : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"}`}>{PERIOD_LABEL[p]}</Link>
        ))}
      </div>

      {rows.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartPanel title="Value by rep" subtitle="won quotes vs order $">
            <GroupedBars data={rows.slice(0, 8).map((r) => ({ name: r.name.split(" ")[0], won: r.wonValue, orders: r.orderValue }))} aKey="won" bKey="orders" aLabel="Won $" bLabel="Order $" />
          </ChartPanel>
          <ChartPanel title="Touches by rep" subtitle="calls + notes + emails + visits">
            <HBars data={rows.slice(0, 8).map((r) => ({ name: r.name, value: r.touches }))} kind="num" gid="g-touches" />
          </ChartPanel>
        </div>
      )}

      <Card className="overflow-x-auto p-0">
        {rows.length === 0 ? (
          <p className="px-5 py-6 text-sm text-neutral-400">No activity, quotes, or orders in this period.</p>
        ) : (
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-[10px] uppercase tracking-wide text-neutral-400">
                <th className="px-4 py-2">Rep</th>
                <th className="px-4 py-2 text-right">Calls</th><th className="px-4 py-2 text-right">Notes</th><th className="px-4 py-2 text-right">Emails</th><th className="px-4 py-2 text-right">Visits</th><th className="px-4 py-2 text-right">Touches</th>
                <th className="px-4 py-2 text-right">Quotes</th><th className="px-4 py-2 text-right">Won</th><th className="px-4 py-2 text-right">Won $</th>
                <th className="px-4 py-2 text-right">Orders</th><th className="px-4 py-2 text-right">Order $</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((r) => (
                <tr key={r.userId}>
                  <td className="px-4 py-2 font-medium text-neutral-900">{r.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-neutral-600">{r.calls}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-neutral-600">{r.notes}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-neutral-600">{r.emails}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-neutral-600">{r.visits}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium text-neutral-800">{r.touches}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-neutral-600">{r.quotes}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-neutral-600">{r.quotesWon}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-neutral-800">{money2(r.wonValue)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-neutral-600">{r.orders}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium text-neutral-900">{money2(r.orderValue)}</td>
                </tr>
              ))}
              <tr className="border-t border-neutral-200 text-xs font-semibold text-neutral-800">
                <td className="px-4 py-2">Total</td>
                <td colSpan={4} />
                <td className="px-4 py-2 text-right tabular-nums">{tot.touches}</td>
                <td className="px-4 py-2 text-right tabular-nums">{tot.quotes}</td>
                <td className="px-4 py-2 text-right tabular-nums">{tot.won}</td>
                <td className="px-4 py-2 text-right tabular-nums">{money2(tot.wonValue)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{tot.orders}</td>
                <td className="px-4 py-2 text-right tabular-nums">{money2(tot.orderValue)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </Card>

      <p className="text-xs text-neutral-400">Touches = calls + notes + emails + visits logged on accounts (system entries excluded). Won = accepted or converted quotes. Order $ credits the rep on the sales order.</p>
    </div>
  );
}
