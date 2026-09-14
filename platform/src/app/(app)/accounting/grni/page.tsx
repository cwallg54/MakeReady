import Link from "next/link";
import { DateTime } from "luxon";
import { requireModule } from "@/lib/auth/guards";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { grniAging } from "@/lib/accounting/payment-runs";

export const dynamic = "force-dynamic";
const TZ = "America/Denver";
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const moneyR = (n: number) => `$${Math.round(n).toLocaleString()}`;
const fmt = (d: Date) => DateTime.fromJSDate(d).setZone(TZ).toFormat("LLL d, yyyy");

export default async function GrniPage() {
  await requireModule("accounting");
  const { rows, total, buckets } = await grniAging();
  const stale = rows.filter((r) => r.ageDays >= 61);
  const staleTotal = stale.reduce((s, r) => s + r.value, 0);

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <Link href="/accounting" className="text-neutral-500 hover:text-neutral-900">← Accounting</Link>
      </div>
      <PageHeader
        title="Goods received, not invoiced"
        description="Stock booked in against a purchase order that the supplier has not billed yet. The balance sits in GRNI until their invoice lands — the month-end job is clearing the stale end of this list."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="GRNI balance" value={moneyR(total)} />
        <StatCard label="Older than 60 days" value={moneyR(staleTotal)} />
        <StatCard label="Receipts outstanding" value={String(rows.length)} />
        <StatCard label="Needing a decision" value={String(stale.length)} />
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">By age</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          {buckets.map((b) => (
            <div key={b.label} className="rounded-lg border border-neutral-200 p-3">
              <div className="text-xs text-neutral-500">{b.label}</div>
              <div className="text-lg font-bold text-neutral-900">{moneyR(b.value)}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-neutral-900">Receipts awaiting a vendor bill</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Anything past 60 days usually means the invoice will never come — those get written back out of GRNI with a journal entry at the close.
        </p>
        {rows.length === 0 ? (
          <p className="rounded-md bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-500">Nothing received is waiting on a bill.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="py-2 pr-3">PO</th>
                  <th className="py-2 pr-3">Vendor</th>
                  <th className="py-2 pr-3">Received</th>
                  <th className="py-2 pr-3 text-right">Age</th>
                  <th className="py-2 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((r, i) => (
                  <tr key={`${r.poId ?? "x"}-${i}`} className="border-b border-neutral-100">
                    <td className="py-2 pr-3">
                      {r.poId ? (
                        <Link href={`/purchasing/orders/${r.poId}`} className="font-mono text-xs text-neutral-700 hover:text-brand">{r.poNumber}</Link>
                      ) : (
                        <span className="font-mono text-xs text-neutral-500">{r.poNumber}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-neutral-900">{r.vendor}</td>
                    <td className="py-2 pr-3 text-xs text-neutral-500">{fmt(r.receivedDate)}</td>
                    <td className={`py-2 pr-3 text-right text-xs ${r.ageDays >= 61 ? "font-medium text-amber-700" : "text-neutral-500"}`}>{r.ageDays}d</td>
                    <td className="py-2 text-right tabular-nums font-medium text-neutral-900">{money(r.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 100 && <p className="mt-2 text-xs text-neutral-400">Showing the first 100 of {rows.length}.</p>}
          </div>
        )}
      </Card>
    </div>
  );
}
