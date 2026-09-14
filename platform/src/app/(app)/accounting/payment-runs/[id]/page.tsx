import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { paymentRunDetail } from "@/lib/accounting/payment-runs";
import {
  approvePaymentRunAction,
  payPaymentRunAction,
  toggleRunLineAction,
  voidPaymentRunAction,
} from "@/lib/accounting/ap-run-actions";

export const dynamic = "force-dynamic";
const TZ = "America/Denver";
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const fmt = (d: Date | null) => (d ? DateTime.fromJSDate(d).setZone(TZ).toFormat("LLL d, yyyy") : "—");
const inp = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand";

export default async function PaymentRunPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireModule("accounting");
  const editable = canEdit(user.roles, "accounting");
  const { id } = await params;

  const detail = await paymentRunDetail(id);
  if (!detail) notFound();
  const { run, lines } = detail;

  const included = lines.filter((l) => l.included);
  const total = included.reduce((s, l) => s + l.amount, 0);
  const vendors = new Set(included.map((l) => l.vendor)).size;
  const isDraft = run.status === "draft";

  return (
    <div className="max-w-4xl space-y-6">
      <div className="text-sm">
        <Link href="/accounting/payment-runs" className="text-neutral-500 hover:text-neutral-900">← Payment runs</Link>
      </div>
      <PageHeader
        title={run.runNumber}
        description={`${run.method.toUpperCase()} · ${fmt(run.runDate)} · ${run.status}${run.dueThrough ? ` · bills due through ${run.dueThrough}` : ""}`}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="text-xs text-neutral-500">Total to pay</div>
          <div className="text-xl font-bold text-neutral-900">{money(total)}</div>
        </Card>
        <Card>
          <div className="text-xs text-neutral-500">Bills / vendors</div>
          <div className="text-xl font-bold text-neutral-900">{included.length} / {vendors}</div>
        </Card>
        <Card>
          <div className="text-xs text-neutral-500">Instruments</div>
          <div className="text-xl font-bold text-neutral-900">
            {run.method === "check" ? `${vendors} cheque${vendors === 1 ? "" : "s"}` : `${vendors} transfer${vendors === 1 ? "" : "s"}`}
          </div>
          {run.firstCheckNumber && <div className="text-[11px] text-neutral-500">from #{run.firstCheckNumber}</div>}
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Bills in this run</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                <th className="py-2 pr-3">Vendor</th>
                <th className="py-2 pr-3">Bill</th>
                <th className="py-2 pr-3">Due</th>
                <th className="py-2 pr-3 text-right">Amount</th>
                <th className="py-2 pr-3">Instrument</th>
                {editable && isDraft && <th className="py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className={`border-b border-neutral-100 ${l.included ? "" : "opacity-40"}`}>
                  <td className="py-2 pr-3 text-neutral-900">{l.vendor}</td>
                  <td className="py-2 pr-3">
                    {l.billId ? (
                      <Link href={`/accounting/bills/${l.billId}`} className="font-mono text-xs text-neutral-600 hover:text-brand">{l.billNumber}</Link>
                    ) : (
                      <span className="font-mono text-xs text-neutral-500">{l.billNumber ?? "—"}</span>
                    )}
                    {l.vendorRef && <span className="ml-2 text-xs text-neutral-400">{l.vendorRef}</span>}
                  </td>
                  <td className="py-2 pr-3 text-xs text-neutral-500">{fmt(l.dueDate)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums font-medium text-neutral-900">{money(l.amount)}</td>
                  <td className="py-2 pr-3 font-mono text-xs text-neutral-500">{l.instrumentNumber ?? "—"}</td>
                  {editable && isDraft && (
                    <td className="py-2 text-right">
                      <form action={toggleRunLineAction}>
                        <input type="hidden" name="runId" value={id} />
                        <input type="hidden" name="lineId" value={l.id} />
                        <input type="hidden" name="included" value={l.included ? "0" : "1"} />
                        <button className="text-xs text-neutral-400 hover:text-neutral-900">{l.included ? "hold back" : "put back"}</button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {editable && run.status !== "void" && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Move the run along</h2>
          <div className="flex flex-wrap items-center gap-3">
            {isDraft && (
              <form action={approvePaymentRunAction}>
                <input type="hidden" name="runId" value={id} />
                <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Approve run</button>
              </form>
            )}
            {run.status === "approved" && (
              <form action={payPaymentRunAction}>
                <input type="hidden" name="runId" value={id} />
                <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">
                  Pay {money(total)}
                </button>
              </form>
            )}
            {run.status === "paid" && (
              <span className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                Paid {run.paidAt ? fmt(run.paidAt) : ""} — Dr Accounts Payable / Cr bank, posted as one entry.
              </span>
            )}
            <form action={voidPaymentRunAction} className="ml-auto flex items-end gap-2">
              <input type="hidden" name="runId" value={id} />
              <input name="reason" placeholder="void reason" className={`w-40 ${inp}`} />
              <button className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700 hover:border-red-300 hover:text-red-600">
                Void run
              </button>
            </form>
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            Approving is the sign-off; paying writes one payment per bill, numbers one instrument per vendor, and posts the batch to the GL.
            Voiding undoes all of it and reverses the entry.
          </p>
        </Card>
      )}
    </div>
  );
}
