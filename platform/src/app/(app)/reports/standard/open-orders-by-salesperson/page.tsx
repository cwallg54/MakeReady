import Link from "next/link";
import { Fragment } from "react";
import { redirect } from "next/navigation";
import { requireModule } from "@/lib/auth/guards";
import { canBuildReports } from "@/lib/reports/sources";
import { PageHeader, Card } from "@/components/ui";
import { getOpenOrders, type OpenOrderRow } from "@/lib/reports/standard-data";
import { fmtDate } from "@/lib/format";
import { money2, daysUntil, ORDER_TYPE_LABEL } from "@/lib/reports/standard";

export const dynamic = "force-dynamic";

const monthFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", month: "long", year: "numeric" });
const monthKeyFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", year: "numeric", month: "2-digit" });

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    (m.get(k) ?? m.set(k, []).get(k)!).push(r);
  }
  return m;
}
const sum = (rows: OpenOrderRow[]) => rows.reduce((s, r) => s + r.amount, 0);

export default async function OpenOrdersBySalespersonPage() {
  const user = await requireModule("reports");
  if (!canBuildReports(user.roles)) redirect("/reports");
  const now = new Date();
  const rows = await getOpenOrders();

  const byRep = [...groupBy(rows, (r) => r.repName).entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="max-w-full space-y-6">
      <Link href="/reports" className="text-sm text-neutral-500 hover:text-neutral-900">← Reports</Link>
      <PageHeader
        title="Open Orders by Salesperson"
        description="Open orders grouped by salesperson → due month → territory → customer."
        action={<Link href="/reports/standard/open-orders-by-salesperson/export" className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Export CSV ↓</Link>}
      />

      {rows.length === 0 && <Card><p className="text-sm text-neutral-400">No open orders.</p></Card>}

      {byRep.map(([repName, repRows]) => {
        // Due month buckets, chronological; undated orders sort last.
        const byMonth = [...groupBy(repRows, (r) => (r.dueDate ? monthKeyFmt.format(r.dueDate) : "zzzz")).entries()].sort((a, b) => a[0].localeCompare(b[0]));
        return (
          <Card key={repName} className="overflow-x-auto">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-900">{repName}</h2>
              <span className="text-sm font-semibold text-neutral-900 tabular-nums">{money2(sum(repRows))}</span>
            </div>
            <table className="w-full min-w-[900px] text-xs">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-[10px] uppercase tracking-wide text-neutral-400">
                  <th className="px-2 py-1">SO #</th><th className="px-2 py-1">Type</th><th className="px-2 py-1">PO #</th>
                  <th className="px-2 py-1">Entered</th><th className="px-2 py-1">Due</th><th className="px-2 py-1 text-right">Days</th>
                  <th className="px-2 py-1">Date Type</th><th className="px-2 py-1">Ship Via</th><th className="px-2 py-1 text-right">Amount</th>
                </tr>
              </thead>
              {byMonth.map(([mk, monthRows]) => {
                const monthLabel = mk === "zzzz" ? "No due date" : monthFmt.format(monthRows[0].dueDate!);
                const byTerritory = [...groupBy(monthRows, (r) => r.territory || "—").entries()].sort((a, b) => a[0].localeCompare(b[0]));
                return (
                  <tbody key={mk}>
                    <tr className="bg-neutral-50"><td colSpan={9} className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-700">{monthLabel}</td></tr>
                    {byTerritory.map(([terr, terrRows]) => {
                      const byCust = [...groupBy(terrRows, (r) => r.customer).entries()].sort((a, b) => a[0].localeCompare(b[0]));
                      return (
                        <Fragment key={`${mk}-${terr}`}>
                          <tr><td colSpan={9} className="px-2 pt-2 text-[11px] font-medium text-neutral-500">{terr}</td></tr>
                          {byCust.map(([cust, custRows]) => (
                            <Fragment key={`${mk}-${terr}-${cust}`}>
                              <tr><td colSpan={9} className="px-4 py-0.5 text-[11px] italic text-neutral-500">{custRows[0].code ? `${custRows[0].code} · ` : ""}{cust}</td></tr>
                              {custRows.map((r) => {
                                const d = r.dueDate ? daysUntil(r.dueDate, now) : null;
                                return (
                                  <tr key={r.id} className="border-b border-neutral-50">
                                    <td className="px-2 py-1"><Link href={`/sales/orders/${r.id}`} className="font-medium text-blue-600 hover:underline">{r.orderNumber}</Link></td>
                                    <td className="px-2 py-1" title={r.orderType ? ORDER_TYPE_LABEL[r.orderType] : ""}>{r.orderType ?? "—"}</td>
                                    <td className="px-2 py-1 text-neutral-500">{r.poNumber ?? ""}</td>
                                    <td className="px-2 py-1 text-neutral-500">{fmtDate(r.enteredDate)}</td>
                                    <td className="px-2 py-1 text-neutral-500">{r.dueDate ? fmtDate(r.dueDate) : "—"}</td>
                                    <td className={`px-2 py-1 text-right tabular-nums ${d != null && d < 0 ? "font-semibold text-red-600" : "text-neutral-500"}`}>{d ?? ""}</td>
                                    <td className="px-2 py-1 text-neutral-500">{r.dateType}</td>
                                    <td className="px-2 py-1 text-neutral-500">{r.shipVia ?? ""}</td>
                                    <td className="px-2 py-1 text-right tabular-nums text-neutral-800">{money2(r.amount)}</td>
                                  </tr>
                                );
                              })}
                            </Fragment>
                          ))}
                          <tr><td colSpan={8} className="px-2 py-1 text-right text-[11px] text-neutral-500">{terr} Total</td><td className="px-2 py-1 text-right text-[11px] font-semibold tabular-nums text-neutral-800">{money2(sum(terrRows))}</td></tr>
                        </Fragment>
                      );
                    })}
                    <tr className="border-t border-neutral-200"><td colSpan={8} className="px-2 py-1 text-right text-xs font-semibold text-neutral-700">{monthLabel} Total</td><td className="px-2 py-1 text-right text-xs font-semibold tabular-nums text-neutral-900">{money2(sum(monthRows))}</td></tr>
                  </tbody>
                );
              })}
            </table>
          </Card>
        );
      })}

      {rows.length > 0 && (
        <Card>
          <div className="flex items-center justify-between text-sm font-semibold text-neutral-900">
            <span>Grand total ({rows.length} open orders)</span>
            <span className="tabular-nums">{money2(sum(rows))}</span>
          </div>
        </Card>
      )}
    </div>
  );
}
