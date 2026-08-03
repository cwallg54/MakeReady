import Link from "next/link";
import { redirect } from "next/navigation";
import { requireModule } from "@/lib/auth/guards";
import { canBuildReports } from "@/lib/reports/sources";
import { PageHeader, Card } from "@/components/ui";
import { getOpenOrders, type OpenOrderRow } from "@/lib/reports/standard-data";
import { fmtDate } from "@/lib/format";
import { money2, daysUntil, ORDER_TYPES, ORDER_TYPE_LABEL } from "@/lib/reports/standard";
import { reportConfig, reportTitle, isHidden } from "@/lib/reports/report-config";
import { getReportSettings } from "@/lib/reports/settings";

export const dynamic = "force-dynamic";

const sum = (rows: OpenOrderRow[]) => rows.reduce((s, r) => s + r.amount, 0);

export default async function OpenOrdersByTypePage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const user = await requireModule("reports");
  if (!canBuildReports(user.roles)) redirect("/reports");
  const sp = await searchParams;
  const now = new Date();

  const cfgDef = reportConfig("open-orders-by-type")!;
  const settings = await getReportSettings("open-orders-by-type");
  const hidden = (k: string) => isHidden(settings, k);
  const hiddenCount = ["customerCode", "salesperson", "dateType", "entered", "daysOpen"].filter(hidden).length;
  const totalColSpan = 9 - hiddenCount; // all columns except the trailing Amount

  // A URL type wins; otherwise fall back to the saved default type. `?type=all`
  // forces the ungrouped view even when a default is configured.
  const filter = sp.type
    ? (ORDER_TYPE_LABEL[sp.type] ? sp.type : null)
    : (settings.filters?.type && ORDER_TYPE_LABEL[settings.filters.type] ? settings.filters.type : null);

  const sortKey = settings.sortKey ?? "due";
  const sortDir = settings.sortDir ?? "asc";
  const cmp = (a: OpenOrderRow, b: OpenOrderRow) => {
    const d = sortKey === "entered" ? a.enteredDate.getTime() - b.enteredDate.getTime()
      : sortKey === "amount" ? a.amount - b.amount
      : (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity);
    return sortDir === "asc" ? d : -d;
  };

  let rows = await getOpenOrders();
  if (filter) rows = rows.filter((r) => r.orderType === filter);

  const typeKeys = filter ? [filter] : [...ORDER_TYPES.map((t) => t.code), "Unspecified"];
  const grouped = typeKeys
    .map((code) => ({
      code,
      label: code === "Unspecified" ? "Unspecified" : ORDER_TYPE_LABEL[code] ?? code,
      rows: rows.filter((r) => (code === "Unspecified" ? !r.orderType : r.orderType === code)).sort(cmp),
    }))
    .filter((g) => g.rows.length > 0);

  return (
    <div className="max-w-full space-y-6">
      <Link href="/reports" className="text-sm text-neutral-500 hover:text-neutral-900">← Reports</Link>
      <PageHeader
        title={reportTitle(cfgDef, settings)}
        description="Open orders grouped by product / decoration type."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/reports/config/open-orders-by-type" className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Edit</Link>
            <Link href={`/reports/standard/open-orders-by-type/export${filter ? `?type=${filter}` : ""}`} className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Export CSV ↓</Link>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-neutral-500">Type:</span>
        <Link href="/reports/standard/open-orders-by-type?type=all" className={`rounded-md border px-3 py-1 ${!filter ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"}`}>All</Link>
        {ORDER_TYPES.map((t) => (
          <Link key={t.code} href={`/reports/standard/open-orders-by-type?type=${t.code}`} className={`rounded-md border px-3 py-1 ${filter === t.code ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"}`}>{t.code}</Link>
        ))}
      </div>

      {grouped.length === 0 && <Card><p className="text-sm text-neutral-400">No open orders{filter ? ` of type ${filter}` : ""}.</p></Card>}

      {grouped.map((g) => (
        <Card key={g.code} className="overflow-x-auto">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900">{g.label}</h2>
            <span className="text-sm font-semibold text-neutral-900 tabular-nums">{money2(sum(g.rows))}</span>
          </div>
          <table className="w-full min-w-[900px] text-xs">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-[10px] uppercase tracking-wide text-neutral-400">
                <th className="px-2 py-1">SO #</th>{!hidden("customerCode") && <th className="px-2 py-1">Cust #</th>}<th className="px-2 py-1">Customer</th>
                {!hidden("salesperson") && <th className="px-2 py-1">Salesperson</th>}{!hidden("dateType") && <th className="px-2 py-1">Date Type</th>}{!hidden("entered") && <th className="px-2 py-1">Entered</th>}
                {!hidden("daysOpen") && <th className="px-2 py-1 text-right">Days Open</th>}<th className="px-2 py-1">Due</th><th className="px-2 py-1 text-right">Days Until Due</th><th className="px-2 py-1 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r) => {
                const daysOpen = daysUntil(now, r.enteredDate);
                const until = r.dueDate ? daysUntil(r.dueDate, now) : null;
                return (
                  <tr key={r.id} className="border-b border-neutral-50">
                    <td className="px-2 py-1"><Link href={`/sales/orders/${r.id}`} className="font-medium text-blue-600 hover:underline">{r.orderNumber}</Link></td>
                    {!hidden("customerCode") && <td className="px-2 py-1 text-neutral-500">{r.code ?? ""}</td>}
                    <td className="px-2 py-1 text-neutral-800">{r.customer}</td>
                    {!hidden("salesperson") && <td className="px-2 py-1 text-neutral-500">{r.repName}</td>}
                    {!hidden("dateType") && <td className="px-2 py-1 text-neutral-500">{r.dateType}</td>}
                    {!hidden("entered") && <td className="px-2 py-1 text-neutral-500">{fmtDate(r.enteredDate)}</td>}
                    {!hidden("daysOpen") && <td className="px-2 py-1 text-right tabular-nums text-neutral-500">{daysOpen}</td>}
                    <td className="px-2 py-1 text-neutral-500">{r.dueDate ? fmtDate(r.dueDate) : "—"}</td>
                    <td className={`px-2 py-1 text-right tabular-nums ${until != null && until < 0 ? "font-semibold text-red-600" : "text-neutral-500"}`}>{until ?? ""}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-neutral-800">{money2(r.amount)}</td>
                  </tr>
                );
              })}
              <tr className="border-t border-neutral-200"><td colSpan={totalColSpan} className="px-2 py-1 text-right text-xs font-semibold text-neutral-700">{g.label} Total</td><td className="px-2 py-1 text-right text-xs font-semibold tabular-nums text-neutral-900">{money2(sum(g.rows))}</td></tr>
            </tbody>
          </table>
        </Card>
      ))}

      {grouped.length > 0 && (
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
