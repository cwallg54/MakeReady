import Link from "next/link";
import { DateTime } from "luxon";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { payableBills, listPaymentRuns } from "@/lib/accounting/payment-runs";
import { bankAccounts } from "@/lib/accounting/deposits";
import { createPaymentRunAction } from "@/lib/accounting/ap-run-actions";

export const dynamic = "force-dynamic";
const TZ = "America/Denver";
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const moneyR = (n: number) => `$${Math.round(n).toLocaleString()}`;
const fmt = (d: Date | null) => (d ? DateTime.fromJSDate(d).setZone(TZ).toFormat("LLL d, yyyy") : "—");
const inp = "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand";

const STATUS_STYLE: Record<string, string> = {
  draft: "border-neutral-200 bg-neutral-100 text-neutral-600",
  approved: "border-amber-200 bg-amber-50 text-amber-700",
  paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
  void: "border-neutral-200 bg-neutral-100 text-neutral-400",
};

export default async function PaymentRunsPage({ searchParams }: { searchParams: Promise<{ through?: string }> }) {
  const user = await requireModule("accounting");
  const editable = canEdit(user.roles, "accounting");
  const sp = await searchParams;

  const today = DateTime.now().setZone(TZ);
  // Default the selection to everything due within the next week — how a
  // weekly run gets built.
  const throughStr = sp.through || today.plus({ days: 7 }).toFormat("yyyy-LL-dd");
  const through = new Date(`${throughStr}T23:59:59`);

  const [due, banks, runs] = await Promise.all([payableBills(through), bankAccounts(), listPaymentRuns(20)]);
  const dueTotal = due.reduce((s, b) => s + b.balance, 0);
  const overdue = due.filter((b) => b.daysUntilDue < 0);
  const overdueTotal = overdue.reduce((s, b) => s + b.balance, 0);

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <Link href="/accounting" className="text-neutral-500 hover:text-neutral-900">← Accounting</Link>
      </div>
      <PageHeader
        title="Payment runs"
        description="Pay AP in batches: pick what is due, get it approved, then produce the cheques or the ACH batch. One instrument per vendor, one journal entry per run."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={`Due through ${DateTime.fromISO(throughStr).toFormat("LLL d")}`} value={moneyR(dueTotal)} />
        <StatCard label="Already past due" value={moneyR(overdueTotal)} />
        <StatCard label="Bills selected" value={String(due.length)} />
      </div>

      <Card>
        <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
          <label>
            <span className="mb-1 block text-xs font-medium text-neutral-600">Include bills due through</span>
            <input name="through" type="date" defaultValue={throughStr} className={inp} />
          </label>
          <button className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700 hover:border-neutral-400">Refresh</button>
        </form>

        {due.length === 0 ? (
          <p className="rounded-md bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-500">Nothing falls due by that date.</p>
        ) : (
          <form action={createPaymentRunAction}>
            <input type="hidden" name="dueThrough" value={throughStr} />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                    <th className="w-8 py-2 pr-3"></th>
                    <th className="py-2 pr-3">Vendor</th>
                    <th className="py-2 pr-3">Bill</th>
                    <th className="py-2 pr-3">Their ref</th>
                    <th className="py-2 pr-3">Due</th>
                    <th className="py-2 pr-3 text-right">Total</th>
                    <th className="py-2 pr-3 text-right">Credits</th>
                    <th className="py-2 text-right">To pay</th>
                  </tr>
                </thead>
                <tbody>
                  {due.map((b) => (
                    <tr key={b.id} className="border-b border-neutral-100">
                      <td className="py-2 pr-3">
                        <input type="checkbox" name="billIds" value={b.id} defaultChecked disabled={!editable} className="h-4 w-4" />
                      </td>
                      <td className="py-2 pr-3 text-neutral-900">{b.vendor}</td>
                      <td className="py-2 pr-3">
                        <Link href={`/accounting/bills/${b.id}`} className="font-mono text-xs text-neutral-600 hover:text-brand">{b.billNumber}</Link>
                      </td>
                      <td className="py-2 pr-3 text-xs text-neutral-500">{b.vendorRef ?? "—"}</td>
                      <td className={`py-2 pr-3 text-xs ${b.daysUntilDue < 0 ? "font-medium text-amber-700" : "text-neutral-500"}`}>
                        {fmt(b.dueDate)}
                        {b.daysUntilDue < 0 && <span className="ml-1">({Math.abs(b.daysUntilDue)}d late)</span>}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-neutral-600">{money(b.total)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-neutral-500">{b.credits > 0 ? money(b.credits) : "—"}</td>
                      <td className="py-2 text-right tabular-nums font-medium text-neutral-900">{money(b.balance)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-neutral-300 font-semibold">
                    <td colSpan={7} className="py-2 pr-3 text-right text-neutral-700">Batch total</td>
                    <td className="py-2 text-right tabular-nums text-neutral-900">{money(dueTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {editable && (
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label>
                  <span className="mb-1 block text-xs font-medium text-neutral-600">Pay date</span>
                  <input name="runDate" type="date" defaultValue={today.toFormat("yyyy-LL-dd")} className={inp} />
                </label>
                <label>
                  <span className="mb-1 block text-xs font-medium text-neutral-600">Method</span>
                  <select name="method" className={inp} defaultValue="ach">
                    <option value="ach">ACH / transfer</option>
                    <option value="check">Cheque</option>
                    <option value="card">Card</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label>
                  <span className="mb-1 block text-xs font-medium text-neutral-600">From</span>
                  <select name="bankAccountId" className={inp} defaultValue={banks[0]?.id}>
                    {banks.map((b) => (
                      <option key={b.id} value={b.id}>{b.code} — {b.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="mb-1 block text-xs font-medium text-neutral-600">First cheque no. <span className="text-neutral-400">if cheques</span></span>
                  <input name="firstCheckNumber" inputMode="numeric" className={`w-32 ${inp}`} placeholder="e.g. 10241" />
                </label>
                <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Build run</button>
              </div>
            )}
          </form>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Recent runs</h2>
        {runs.length === 0 ? (
          <p className="rounded-md bg-neutral-50 px-3 py-4 text-center text-sm text-neutral-500">No payment runs yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="py-2 pr-3">Run</th>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Method</th>
                  <th className="py-2 pr-3">From</th>
                  <th className="py-2 pr-3 text-right">Bills</th>
                  <th className="py-2 pr-3 text-right">Total</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-b border-neutral-100">
                    <td className="py-2 pr-3">
                      <Link href={`/accounting/payment-runs/${r.id}`} className="font-mono text-xs text-neutral-700 hover:text-brand">{r.runNumber}</Link>
                    </td>
                    <td className="py-2 pr-3 text-xs text-neutral-500">{fmt(r.runDate)}</td>
                    <td className="py-2 pr-3 text-xs uppercase text-neutral-500">{r.method}</td>
                    <td className="py-2 pr-3 text-neutral-700">{r.bank ?? "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-neutral-600">{r.billCount}</td>
                    <td className="py-2 pr-3 text-right tabular-nums font-medium text-neutral-900">{money(r.total)}</td>
                    <td className="py-2"><span className={`rounded border px-2 py-0.5 text-xs ${STATUS_STYLE[r.status]}`}>{r.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
