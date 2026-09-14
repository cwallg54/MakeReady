import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db";
import { payments, businessPartners, arApplications, invoices, deposits } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { openInvoicesFor, paymentUnapplied, allocateOldestFirst } from "@/lib/accounting/ar-apply";
import { applyPaymentAction, autoApplyPaymentAction } from "@/lib/accounting/ar-actions";

export const dynamic = "force-dynamic";
const TZ = "America/Denver";
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const fmt = (d: Date | null) => (d ? DateTime.fromJSDate(d).setZone(TZ).toFormat("LLL d, yyyy") : "—");

export default async function PaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireModule("accounting");
  const editable = canEdit(user.roles, "accounting");
  const { id } = await params;

  const payment = await db.query.payments.findFirst({ where: eq(payments.id, id) });
  if (!payment) notFound();

  const [bp, unapplied, applied, deposit] = await Promise.all([
    payment.bpId
      ? db.query.businessPartners.findFirst({ where: eq(businessPartners.id, payment.bpId), columns: { id: true, companyName: true } })
      : null,
    paymentUnapplied(id),
    db
      .select({ id: arApplications.id, amount: arApplications.amount, invoiceId: arApplications.invoiceId, invoiceNumber: invoices.invoiceNumber })
      .from(arApplications)
      .leftJoin(invoices, eq(invoices.id, arApplications.invoiceId))
      .where(eq(arApplications.paymentId, id)),
    payment.depositId ? db.query.deposits.findFirst({ where: eq(deposits.id, payment.depositId), columns: { id: true, depositNumber: true, depositDate: true } }) : null,
  ]);

  const open = payment.bpId ? await openInvoicesFor(payment.bpId) : [];
  const appliedByInvoice = new Map(applied.map((a) => [a.invoiceId, Number(a.amount)]));
  // Suggest oldest-first for whatever is still unapplied, so the desk can just
  // glance at the numbers and submit.
  const suggestion = new Map(
    allocateOldestFirst(unapplied, open.filter((o) => !appliedByInvoice.has(o.id))).map((l) => [l.invoiceId, l.amount]),
  );
  const total = Number(payment.amount);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="text-sm">
        <Link href="/accounting/payments" className="text-neutral-500 hover:text-neutral-900">← Payments</Link>
      </div>
      <PageHeader
        title={`Receipt ${money(total)}`}
        description={`${payment.method.toUpperCase()}${payment.reference ? ` · ${payment.reference}` : ""} · received ${fmt(payment.receivedDate)}`}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="text-xs text-neutral-500">Customer</div>
          <div className="text-sm font-semibold text-neutral-900">
            {bp ? <Link href={`/crm/${bp.id}`} className="hover:text-brand">{bp.companyName}</Link> : "—"}
          </div>
        </Card>
        <Card>
          <div className="text-xs text-neutral-500">Applied</div>
          <div className="text-sm font-semibold text-neutral-900">{money(total - unapplied)}</div>
        </Card>
        <Card>
          <div className="text-xs text-neutral-500">On account</div>
          <div className={`text-sm font-semibold ${unapplied > 0.005 ? "text-amber-700" : "text-neutral-900"}`}>{money(unapplied)}</div>
        </Card>
      </div>

      {deposit && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          Banked in deposit <Link href="/accounting/deposits" className="font-semibold underline">{deposit.depositNumber}</Link> on {fmt(deposit.depositDate)}.
        </div>
      )}

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">Apply to invoices</h2>
            <p className="text-xs text-neutral-500">
              One receipt usually settles several invoices. Amounts are pre-filled oldest-first — adjust and save, or leave blank to hold the cash on account.
            </p>
          </div>
          {editable && unapplied > 0.005 && open.length > 0 && (
            <form action={autoApplyPaymentAction}>
              <input type="hidden" name="paymentId" value={id} />
              <button className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:border-neutral-400">
                Auto-apply oldest first
              </button>
            </form>
          )}
        </div>

        {open.length === 0 && applied.length === 0 ? (
          <p className="rounded-md bg-neutral-50 px-3 py-4 text-center text-sm text-neutral-500">
            This customer has no open invoices — the receipt sits on account.
          </p>
        ) : (
          <form action={applyPaymentAction}>
            <input type="hidden" name="paymentId" value={id} />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                    <th className="py-2 pr-3">Invoice</th>
                    <th className="py-2 pr-3">Due</th>
                    <th className="py-2 pr-3 text-right">Total</th>
                    <th className="py-2 pr-3 text-right">Open</th>
                    <th className="py-2 text-right">Apply</th>
                  </tr>
                </thead>
                <tbody>
                  {open.map((inv) => {
                    const already = appliedByInvoice.get(inv.id) ?? 0;
                    const preset = already || suggestion.get(inv.id) || "";
                    return (
                      <tr key={inv.id} className="border-b border-neutral-100">
                        <td className="py-2 pr-3">
                          <Link href={`/accounting/invoices/${inv.id}`} className="font-mono text-xs text-neutral-700 hover:text-brand">{inv.invoiceNumber}</Link>
                        </td>
                        <td className="py-2 pr-3 text-xs text-neutral-500">{fmt(inv.dueDate)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-neutral-600">{money(inv.total)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums font-medium text-neutral-900">{money(inv.balance + already)}</td>
                        <td className="py-2 text-right">
                          <input
                            name={`apply[${inv.id}]`}
                            defaultValue={preset === "" ? "" : Number(preset).toFixed(2)}
                            inputMode="decimal"
                            disabled={!editable}
                            className="w-28 rounded-md border border-neutral-300 px-2 py-1 text-right text-sm outline-none focus:border-brand disabled:bg-neutral-100"
                            placeholder="0.00"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {editable && (
              <div className="mt-3 flex items-center gap-3">
                <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Save application</button>
                <span className="text-xs text-neutral-500">Anything left over stays on account and can be applied later.</span>
              </div>
            )}
          </form>
        )}
      </Card>
    </div>
  );
}
