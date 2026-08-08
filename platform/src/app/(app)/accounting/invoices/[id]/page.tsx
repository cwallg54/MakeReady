import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { db } from "@/db";
import { invoices, invoiceLines, payments, businessPartners, orders, orderProofs } from "@/db/schema";
import { OrderJourney } from "@/components/orders/order-journey";
import { computeOrderJourney } from "@/lib/orders/journey";
import { DateTime } from "luxon";
import { PageHeader, Card } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { BpSearchSelect } from "@/components/crm/bp-search-select";
import { fmtDate, fmtDateTime } from "@/lib/format";
import {
  updateInvoiceMetaAction, addInvoiceLineAction, removeInvoiceLineAction,
  sendInvoiceAction, recordPaymentAction, voidInvoiceAction, emailInvoiceAction,
} from "@/lib/accounting/actions";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inp = "w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand";
const lbl = "text-xs font-medium text-neutral-500";
const STATUS_BADGE: Record<string, string> = { draft: "bg-neutral-200 text-neutral-700", sent: "bg-blue-100 text-blue-700", partial: "bg-amber-100 text-amber-700", paid: "bg-emerald-100 text-emerald-700", void: "bg-red-100 text-red-700" };
const METHODS = ["check", "ach", "card", "cash", "credit", "other"];

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireModule("accounting");
  const { id } = await params;
  const editable = canEdit(user.roles, "accounting");

  const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, id) });
  if (!inv) notFound();
  const [lines, pays, bp] = await Promise.all([
    db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id)).orderBy(asc(invoiceLines.sortOrder)),
    db.select().from(payments).where(eq(payments.invoiceId, id)).orderBy(asc(payments.receivedDate)),
    inv.bpId ? db.query.businessPartners.findFirst({ where: eq(businessPartners.id, inv.bpId) }) : Promise.resolve(undefined),
  ]);
  const paid = pays.reduce((s, p) => s + Number(p.amount), 0);
  const balance = Number(inv.total) - paid;
  const voided = !!inv.voidedAt;

  // Lead-to-cash journey (when this invoice is tied to an order).
  const order = inv.orderId ? await db.query.orders.findFirst({ where: eq(orders.id, inv.orderId) }) : null;
  const orderProofsList = order ? await db.select({ status: orderProofs.status }).from(orderProofs).where(eq(orderProofs.orderId, order.id)) : [];
  const journey = order ? computeOrderJourney({
    hasQuote: !!order.quoteId,
    stage: order.stage,
    artApproved: orderProofsList.some((p) => p.status === "approved"),
    productionReady: false,
    hasInvoice: true,
    paid: inv.status === "paid" || balance <= 0.005,
  }) : null;
  const trackUrl = order ? `${process.env.APP_URL ?? "https://makeready.g54.com"}/track/${order.publicToken}` : undefined;
  const canAct = editable && !voided;
  const due = inv.dueDate ? DateTime.fromJSDate(inv.dueDate).setZone("America/Denver").toFormat("yyyy-LL-dd") : "";

  return (
    <div className="max-w-4xl">
      <Link href="/accounting/invoices" className="text-sm text-neutral-500 hover:text-neutral-900">← Invoices</Link>
      <PageHeader
        title={inv.invoiceNumber}
        description={bp ? bp.companyName : "No customer"}
        action={<span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[inv.status]}`}>{inv.status}</span>}
      />

      {voided && <div className="mb-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"><span className="font-semibold">Voided.</span> {inv.voidReason}</div>}

      {order && journey && (
        <div className="mb-6">
          <OrderJourney steps={journey} orderNumber={order.orderNumber} trackUrl={trackUrl} />
        </div>
      )}

      {/* Lifecycle actions */}
      {canAct && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-center gap-2">
            {!inv.issueDate && (
              <form action={sendInvoiceAction}><input type="hidden" name="id" value={inv.id} />
                <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">Issue invoice</button>
              </form>
            )}
            {inv.issueDate && <span className="text-xs text-neutral-500">Issued {fmtDate(inv.issueDate)}{inv.dueDate ? ` · due ${fmtDate(inv.dueDate)}` : ""}</span>}
            <Link href={`/accounting/invoices/${inv.id}/pdf`} target="_blank" className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">PDF ↓</Link>
            <form action={emailInvoiceAction}><input type="hidden" name="id" value={inv.id} />
              <button className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">Email invoice</button>
            </form>
            <form action={voidInvoiceAction} className="ml-auto flex items-center gap-2">
              <input type="hidden" name="id" value={inv.id} />
              <input name="reason" placeholder="void reason" className={`${inp} w-40`} />
              <ConfirmButton message="Void this invoice?" className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50">Void</ConfirmButton>
            </form>
          </div>
        </Card>
      )}

      {/* Meta */}
      <Card className="mb-6">
        {canAct ? (
          <form action={updateInvoiceMetaAction} className="grid gap-3 sm:grid-cols-4">
            <input type="hidden" name="id" value={inv.id} />
            <label className="sm:col-span-2"><span className={lbl}>Customer</span><div className="mt-1"><BpSearchSelect name="bpId" defaultId={inv.bpId ?? ""} defaultLabel={bp?.companyName ?? ""} /></div></label>
            <label><span className={lbl}>Terms</span><input name="terms" defaultValue={inv.terms ?? ""} placeholder="Net 30" className={`mt-1 ${inp}`} /></label>
            <label><span className={lbl}>Due date</span><input name="dueDate" type="date" defaultValue={due} className={`mt-1 ${inp}`} /></label>
            <label><span className={lbl}>Discount $</span><input name="discount" type="number" step="0.01" min="0" defaultValue={inv.discount} className={`mt-1 ${inp}`} /></label>
            <label><span className={lbl}>Tax rate %</span><input name="taxRatePct" type="number" step="0.001" min="0" defaultValue={(Number(inv.taxRate) * 100).toFixed(3).replace(/\.?0+$/, "")} className={`mt-1 ${inp}`} /></label>
            <label className="sm:col-span-3"><span className={lbl}>Notes</span><input name="notes" defaultValue={inv.notes ?? ""} className={`mt-1 ${inp}`} /></label>
            <div className="sm:col-span-4"><button className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">Save details</button></div>
          </form>
        ) : (
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><dt className={lbl}>Customer</dt><dd className="text-neutral-900">{bp?.companyName ?? "—"}</dd></div>
            <div><dt className={lbl}>Terms</dt><dd className="text-neutral-900">{inv.terms ?? "—"}</dd></div>
            <div><dt className={lbl}>Due</dt><dd className="text-neutral-900">{inv.dueDate ? fmtDate(inv.dueDate) : "—"}</dd></div>
            <div><dt className={lbl}>Notes</dt><dd className="text-neutral-900">{inv.notes ?? "—"}</dd></div>
          </dl>
        )}
      </Card>

      {/* Lines */}
      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Line items</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-neutral-400"><th className="py-1">Description</th><th className="py-1 text-right">Qty</th><th className="py-1 text-right">Unit</th><th className="py-1 text-right">Amount</th><th /></tr></thead>
          <tbody className="divide-y divide-neutral-100">
            {lines.length === 0 && <tr><td colSpan={5} className="py-3 text-neutral-400">No lines yet.</td></tr>}
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="py-1.5 text-neutral-800">{l.description}</td>
                <td className="py-1.5 text-right tabular-nums text-neutral-600">{l.qty}</td>
                <td className="py-1.5 text-right tabular-nums text-neutral-600">{money(Number(l.unitPrice))}</td>
                <td className="py-1.5 text-right tabular-nums text-neutral-900">{money(Number(l.extended))}</td>
                <td className="py-1.5 text-right">{canAct && (
                  <form action={removeInvoiceLineAction}><input type="hidden" name="invoiceId" value={inv.id} /><input type="hidden" name="lineId" value={l.id} /><ConfirmButton message="Remove line?" className="text-xs text-red-600 hover:text-red-800">×</ConfirmButton></form>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {canAct && (
          <form action={addInvoiceLineAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-neutral-100 pt-3">
            <input type="hidden" name="invoiceId" value={inv.id} />
            <label className="flex-1"><span className={lbl}>Description</span><input name="description" required className={`mt-1 ${inp}`} /></label>
            <label className="w-20"><span className={lbl}>Qty</span><input name="qty" type="number" min="1" defaultValue="1" className={`mt-1 ${inp}`} /></label>
            <label className="w-28"><span className={lbl}>Unit $</span><input name="unitPrice" type="number" step="0.01" min="0" defaultValue="0" className={`mt-1 ${inp}`} /></label>
            <button className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">+ Add line</button>
          </form>
        )}
        <div className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-neutral-500">Subtotal</span><span className="tabular-nums">{money(Number(inv.subtotal))}</span></div>
          {Number(inv.discount) > 0 && <div className="flex justify-between"><span className="text-neutral-500">Discount</span><span className="tabular-nums">−{money(Number(inv.discount))}</span></div>}
          {Number(inv.tax) > 0 && <div className="flex justify-between"><span className="text-neutral-500">Sales tax ({(Number(inv.taxRate) * 100).toFixed(3).replace(/\.?0+$/, "")}%)</span><span className="tabular-nums">{money(Number(inv.tax))}</span></div>}
          <div className="flex justify-between border-t border-neutral-200 pt-1 font-semibold text-neutral-900"><span>Total</span><span className="tabular-nums">{money(Number(inv.total))}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Paid</span><span className="tabular-nums text-emerald-700">{money(paid)}</span></div>
          <div className="flex justify-between font-semibold"><span>Balance</span><span className="tabular-nums">{money(balance)}</span></div>
        </div>
      </Card>

      {/* Payments */}
      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Payments</h2>
        <div className="mb-3 space-y-1">
          {pays.length === 0 && <p className="text-sm text-neutral-400">No payments recorded.</p>}
          {pays.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-md border border-neutral-100 px-3 py-1.5 text-sm">
              <span className="text-neutral-700">{fmtDateTime(p.receivedDate)} · <span className="capitalize">{p.method}</span>{p.reference ? ` · ${p.reference}` : ""}</span>
              <span className="font-medium tabular-nums text-emerald-700">{money(Number(p.amount))}</span>
            </div>
          ))}
        </div>
        {canAct && balance > 0 && (
          <form action={recordPaymentAction} className="flex flex-wrap items-end gap-2 border-t border-neutral-100 pt-3">
            <input type="hidden" name="invoiceId" value={inv.id} />
            <input type="hidden" name="bpId" value={inv.bpId ?? ""} />
            <label className="w-28"><span className={lbl}>Amount $</span><input name="amount" type="number" step="0.01" min="0" defaultValue={balance.toFixed(2)} className={`mt-1 ${inp}`} /></label>
            <label className="w-28"><span className={lbl}>Method</span><select name="method" className={`mt-1 ${inp}`}>{METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
            <label className="w-32"><span className={lbl}>Reference</span><input name="reference" placeholder="check #" className={`mt-1 ${inp}`} /></label>
            <label className="w-36"><span className={lbl}>Received</span><input name="receivedDate" type="date" className={`mt-1 ${inp}`} /></label>
            <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">Record payment</button>
          </form>
        )}
      </Card>
    </div>
  );
}
