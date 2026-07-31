import Link from "next/link";
import { redirect } from "next/navigation";
import { requireModule } from "@/lib/auth/guards";
import { canBuildReports } from "@/lib/reports/sources";
import { PageHeader, Card } from "@/components/ui";
import { getSalesAnalysis, type SalesYearRow } from "@/lib/reports/standard-data";
import { FISCAL_MONTHS, money0 } from "@/lib/reports/standard";

export const dynamic = "force-dynamic";

const COLS = ["Oct", "Nov", "Dec", "3 Mo", "Diff", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Total"];

function YearCells({ row, prior }: { row: SalesYearRow; prior?: SalesYearRow }) {
  const diff = prior ? row.threeMo - prior.threeMo : 0;
  const cells: (number | null)[] = [
    row.months[0], row.months[1], row.months[2], row.threeMo, prior ? diff : null,
    row.months[3], row.months[4], row.months[5], row.months[6], row.months[7], row.months[8],
    row.months[9], row.months[10], row.months[11], row.total,
  ];
  return (
    <>
      {cells.map((v, i) => (
        <td key={i} className={`px-1.5 py-1 text-right tabular-nums ${i === 3 || i === 14 ? "font-semibold text-neutral-900" : "text-neutral-600"} ${i === 4 && v != null ? (v < 0 ? "text-red-600" : "text-emerald-600") : ""}`}>
          {v == null ? "" : money0(v)}
        </td>
      ))}
    </>
  );
}

export default async function SalesAnalysisPage({ searchParams }: { searchParams: Promise<{ fy?: string }> }) {
  const user = await requireModule("reports");
  if (!canBuildReports(user.roles)) redirect("/reports");
  const sp = await searchParams;

  // Default to the current fiscal year (Oct–Sep).
  const now = new Date();
  const currentFy = now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear();
  const fy = Number(sp.fy) || currentFy;

  const { groups } = await getSalesAnalysis(fy);
  const grand = groups.reduce((a, g) => ({ current: a.current + g.totals.current, prior: a.prior + g.totals.prior, twoAgo: a.twoAgo + g.totals.twoAgo }), { current: 0, prior: 0, twoAgo: 0 });

  return (
    <div className="max-w-full space-y-6">
      <Link href="/reports" className="text-sm text-neutral-500 hover:text-neutral-900">← Reports</Link>
      <PageHeader
        title="Sales Analysis by Salesperson & Customer"
        description={`Fiscal year ${fy} (Oct ${fy - 1} – Sep ${fy}). Monthly sales vs. prior year and two years ago.`}
        action={<Link href={`/reports/standard/sales-analysis/export?fy=${fy}`} className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Export CSV ↓</Link>}
      />

      <div className="flex items-center gap-2 text-sm">
        <span className="text-neutral-500">Fiscal year:</span>
        {[currentFy, currentFy - 1, currentFy - 2].map((y) => (
          <Link key={y} href={`/reports/standard/sales-analysis?fy=${y}`} className={`rounded-md border px-3 py-1 ${y === fy ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"}`}>{y}</Link>
        ))}
      </div>

      {groups.length === 0 && <Card><p className="text-sm text-neutral-400">No sales activity in this fiscal window yet.</p></Card>}

      {groups.map((g) => (
        <Card key={g.repId} className="overflow-x-auto">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">{g.repName}</h2>
          <table className="w-full min-w-[1100px] text-xs">
            <thead>
              <tr className="border-b border-neutral-200 text-right text-[10px] uppercase tracking-wide text-neutral-400">
                <th className="px-1.5 py-1 text-left">Customer</th>
                <th className="px-1.5 py-1 text-left">Period</th>
                {COLS.map((c) => <th key={c} className="px-1.5 py-1">{c}</th>)}
              </tr>
            </thead>
            {g.customers.map((c) => (
              <tbody key={c.bpId} className="border-b border-neutral-100 align-top">
                <tr>
                  <td rowSpan={3} className="px-1.5 py-1 text-left align-top">
                    <div className="font-medium text-neutral-900">{c.name}</div>
                    <div className="text-[10px] text-neutral-400">{c.code}{c.terms ? ` · ${c.terms}` : ""}</div>
                  </td>
                  <td className="px-1.5 py-1 text-left text-neutral-500">Current Yr</td>
                  <YearCells row={c.current} prior={c.prior} />
                </tr>
                <tr>
                  <td className="px-1.5 py-1 text-left text-neutral-500">Prior Yr</td>
                  <YearCells row={c.prior} />
                </tr>
                <tr>
                  <td className="px-1.5 py-1 text-left text-neutral-400">2 Yrs Ago</td>
                  <YearCells row={c.twoAgo} />
                </tr>
              </tbody>
            ))}
            <tbody>
              <tr className="border-t-2 border-neutral-300 font-semibold text-neutral-900">
                <td className="px-1.5 py-1.5 text-left" colSpan={2}>{g.repName} — Total</td>
                <td className="px-1.5 py-1.5 text-right tabular-nums" colSpan={13}>Cur {money0(g.totals.current)} · Prior {money0(g.totals.prior)} · 2yr {money0(g.totals.twoAgo)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </Card>
      ))}

      {groups.length > 0 && (
        <Card>
          <div className="flex items-center justify-between text-sm font-semibold text-neutral-900">
            <span>Grand total</span>
            <span className="tabular-nums">Current {money0(grand.current)} · Prior {money0(grand.prior)} · 2 Yrs Ago {money0(grand.twoAgo)}</span>
          </div>
        </Card>
      )}

      <p className="text-xs text-neutral-400">Fiscal months: {FISCAL_MONTHS.join(" · ")}. Sales recognised on order date; includes migrated order history attributed to each account&apos;s current owner.</p>
    </div>
  );
}
