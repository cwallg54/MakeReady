import Link from "next/link";
import { DateTime } from "luxon";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { bankAccounts, listDeposits, undepositedPayments } from "@/lib/accounting/deposits";
import { createDepositAction, voidDepositAction } from "@/lib/accounting/ar-actions";

export const dynamic = "force-dynamic";
const TZ = "America/Denver";
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const fmt = (d: Date | null) => (d ? DateTime.fromJSDate(d).setZone(TZ).toFormat("LLL d, yyyy") : "—");
const inp = "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand";

export default async function DepositsPage() {
  const user = await requireModule("accounting");
  const editable = canEdit(user.roles, "accounting");
  const today = DateTime.now().setZone(TZ).toFormat("yyyy-LL-dd");

  const [pending, banks, recent] = await Promise.all([undepositedPayments(), bankAccounts(), listDeposits(40)]);
  const pendingTotal = pending.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <Link href="/accounting" className="text-neutral-500 hover:text-neutral-900">← Accounting</Link>
      </div>
      <PageHeader
        title="Deposits"
        description="Receipts sit in Checks Clearing until they are banked. Batch them here the way they go to the bank, so the statement reconciles line for line."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Awaiting deposit" value={money(pendingTotal)} />
        <StatCard label="Receipts in hand" value={String(pending.length)} />
        <StatCard label="Deposits recorded" value={String(recent.length)} />
      </div>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-neutral-900">Undeposited receipts</h2>
        <p className="mb-3 text-xs text-neutral-500">Tick everything going in on one deposit slip — the batch posts as a single line to the bank.</p>

        {pending.length === 0 ? (
          <p className="rounded-md bg-neutral-50 px-3 py-4 text-center text-sm text-neutral-500">Everything taken has been banked.</p>
        ) : (
          <form action={createDepositAction}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                    <th className="py-2 pr-3 w-8"></th>
                    <th className="py-2 pr-3">Received</th>
                    <th className="py-2 pr-3">Customer</th>
                    <th className="py-2 pr-3">Method</th>
                    <th className="py-2 pr-3">Reference</th>
                    <th className="py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((p) => (
                    <tr key={p.id} className="border-b border-neutral-100">
                      <td className="py-2 pr-3">
                        <input type="checkbox" name="paymentIds" value={p.id} defaultChecked disabled={!editable} className="h-4 w-4" />
                      </td>
                      <td className="py-2 pr-3 text-xs text-neutral-500">{fmt(p.receivedDate)}</td>
                      <td className="py-2 pr-3 text-neutral-900">
                        <Link href={`/accounting/payments/${p.id}`} className="hover:text-brand">{p.customer}</Link>
                      </td>
                      <td className="py-2 pr-3 text-xs uppercase text-neutral-500">{p.method}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-neutral-500">{p.reference ?? "—"}</td>
                      <td className="py-2 text-right tabular-nums font-medium text-neutral-900">{money(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-neutral-300 font-semibold">
                    <td colSpan={5} className="py-2 pr-3 text-right text-neutral-700">Batch total</td>
                    <td className="py-2 text-right tabular-nums text-neutral-900">{money(pendingTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {editable && (
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label>
                  <span className="mb-1 block text-xs font-medium text-neutral-600">Deposit date</span>
                  <input name="depositDate" type="date" defaultValue={today} className={inp} />
                </label>
                <label>
                  <span className="mb-1 block text-xs font-medium text-neutral-600">Into</span>
                  <select name="bankAccountId" className={inp} defaultValue={banks[0]?.id}>
                    {banks.map((b) => (
                      <option key={b.id} value={b.id}>{b.code} — {b.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="mb-1 block text-xs font-medium text-neutral-600">Method</span>
                  <select name="method" className={inp} defaultValue="check">
                    {["check", "ach", "card", "cash", "other"].map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </label>
                <label className="flex-1 min-w-[10rem]">
                  <span className="mb-1 block text-xs font-medium text-neutral-600">Slip reference <span className="text-neutral-400">optional</span></span>
                  <input name="reference" className={`w-full ${inp}`} placeholder="e.g. 09/14 morning run" />
                </label>
                <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Record deposit</button>
              </div>
            )}
          </form>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Recent deposits</h2>
        {recent.length === 0 ? (
          <p className="rounded-md bg-neutral-50 px-3 py-4 text-center text-sm text-neutral-500">No deposits yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="py-2 pr-3">Deposit</th>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Bank</th>
                  <th className="py-2 pr-3">Reference</th>
                  <th className="py-2 pr-3 text-right">Receipts</th>
                  <th className="py-2 pr-3 text-right">Total</th>
                  <th className="py-2 pr-3">Status</th>
                  {editable && <th className="py-2"></th>}
                </tr>
              </thead>
              <tbody>
                {recent.map((d) => (
                  <tr key={d.id} className="border-b border-neutral-100">
                    <td className="py-2 pr-3 font-mono text-xs text-neutral-700">{d.depositNumber}</td>
                    <td className="py-2 pr-3 text-xs text-neutral-500">{fmt(d.depositDate)}</td>
                    <td className="py-2 pr-3 text-neutral-700">{d.bank ?? "—"}</td>
                    <td className="py-2 pr-3 text-xs text-neutral-500">{d.reference ?? "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-neutral-600">{d.receipts}</td>
                    <td className="py-2 pr-3 text-right tabular-nums font-medium text-neutral-900">{money(d.total)}</td>
                    <td className="py-2 pr-3">
                      <span className={`rounded border px-2 py-0.5 text-xs ${d.status === "void" ? "border-neutral-200 bg-neutral-100 text-neutral-500" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                        {d.status}
                      </span>
                    </td>
                    {editable && (
                      <td className="py-2 text-right">
                        {d.status !== "void" && (
                          <form action={voidDepositAction} className="inline-flex items-center gap-1">
                            <input type="hidden" name="depositId" value={d.id} />
                            <input name="reason" placeholder="reason" className="w-24 rounded border border-neutral-300 px-1.5 py-1 text-xs" />
                            <button className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:border-red-300 hover:text-red-600">Void</button>
                          </form>
                        )}
                      </td>
                    )}
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
