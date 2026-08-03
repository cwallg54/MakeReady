import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { db } from "@/db";
import { orders, orderEvents, orderArtifacts, orderSpecItems, orderAttachments, orderProofs, businessPartners, contacts, users, userRoles, invoices } from "@/db/schema";
import { createInvoiceFromOrderAction } from "@/lib/accounting/actions";
import { PageHeader, Card } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { fmtDateTime } from "@/lib/format";
import { OrderInfoCard } from "@/components/orders/order-info";
import { inArray } from "drizzle-orm";
import { OrderTracker } from "@/components/orders/order-tracker";
import { ProductionDetails } from "@/components/orders/production-details";
import { OrderProofs } from "@/components/orders/order-proofs";
import { CopyLink } from "@/components/orders/copy-link";
import { ORDER_STAGES, type OrderStage } from "@/lib/orders/stages";
import { setOrderStageAction, emailOrderPdfAction } from "@/lib/orders/actions";
import { submitToArtAction } from "@/lib/art/actions";
import { sendToProductionAction } from "@/lib/production/actions";
import { voidOrderAction } from "@/lib/orders/detail-actions";
import { desc } from "drizzle-orm";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireModule("sales");
  const { id } = await params;
  const editable = canEdit(user.roles, "sales");

  const order = await db.query.orders.findFirst({ where: eq(orders.id, id) });
  if (!order) notFound();
  const voided = !!order.voidedAt;
  const canAct = editable && !voided;
  const [bp, events, artifacts, specItems, attachments, proofs] = await Promise.all([
    order.bpId ? db.query.businessPartners.findFirst({ where: eq(businessPartners.id, order.bpId) }) : Promise.resolve(undefined),
    db.select().from(orderEvents).where(eq(orderEvents.orderId, id)).orderBy(asc(orderEvents.at)),
    db.select().from(orderArtifacts).where(eq(orderArtifacts.orderId, id)).orderBy(desc(orderArtifacts.createdAt)),
    db.select().from(orderSpecItems).where(eq(orderSpecItems.orderId, id)).orderBy(asc(orderSpecItems.sortOrder)),
    db.select().from(orderAttachments).where(eq(orderAttachments.orderId, id)).orderBy(desc(orderAttachments.createdAt)),
    db.select().from(orderProofs).where(eq(orderProofs.orderId, id)).orderBy(desc(orderProofs.createdAt)),
  ]);

  const reachedAt: Partial<Record<OrderStage, string>> = {};
  for (const e of events) if (!reachedAt[e.stage]) reachedAt[e.stage] = fmtDateTime(e.at);

  // Sales reps for the Order info assignment dropdown.
  const repRows = await db
    .selectDistinct({ id: users.id, name: users.name })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(users.status, "active"), inArray(userRoles.role, ["sales_rep", "sales_manager", "admin"])))
    .orderBy(asc(users.name));

  // Accounts-receivable: whether this user can invoice, and any existing invoice.
  const canInvoice = canEdit(user.roles, "accounting");
  const existingInvoice = canInvoice ? await db.query.invoices.findFirst({ where: eq(invoices.orderId, id), columns: { id: true, invoiceNumber: true, status: true } }) : null;

  const base = process.env.APP_URL ?? "https://makeready.g54.com";
  const trackUrl = `${base}/track/${order.publicToken}`;

  const contact = order.bpId
    ? await db.query.contacts.findFirst({ where: and(eq(contacts.bpId, order.bpId), eq(contacts.isPrimary, true)) })
    : undefined;
  const toEmail = contact?.email ?? bp?.email ?? "";
  const mailBody = `Hello,\r\n\r\nYou can track the progress of your order ${order.orderNumber} here:\r\n${trackUrl}\r\n\r\nThank you,\r\nGreat Mountain West (G54)`;
  const mailto = `mailto:${encodeURIComponent(toEmail)}?subject=${encodeURIComponent(`Track your G54 order ${order.orderNumber}`)}&body=${encodeURIComponent(mailBody)}`;

  return (
    <div className="max-w-4xl">
      <Link href="/sales/orders" className="text-sm text-neutral-500 hover:text-neutral-900">← Orders</Link>
      <PageHeader title={order.orderNumber} description={bp ? bp.companyName : "No customer"} />

      {voided && (
        <div className="mb-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="font-semibold">Order voided.</span> {order.voidReason}
          {order.voidedAt && <span className="text-red-600"> · {fmtDateTime(order.voidedAt)}</span>}
        </div>
      )}

      <Card className="mb-6">
        <OrderTracker currentStage={order.stage} reachedAt={reachedAt} />
      </Card>

      <OrderInfoCard order={order} reps={repRows} editable={canAct} />

      {canInvoice && !voided && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900">Invoicing</h2>
              <p className="text-xs text-neutral-500">{existingInvoice ? `Invoice ${existingInvoice.invoiceNumber} (${existingInvoice.status}) has been raised for this order.` : "Bill this order — the quoted lines are copied onto a new invoice."}</p>
            </div>
            {existingInvoice ? (
              <Link href={`/accounting/invoices/${existingInvoice.id}`} className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50">View invoice →</Link>
            ) : (
              <form action={createInvoiceFromOrderAction}>
                <input type="hidden" name="orderId" value={order.id} />
                <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Create invoice →</button>
              </form>
            )}
          </div>
        </Card>
      )}

      {canAct && (
        <Card className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Update stage</h2>
          <div className="flex flex-wrap gap-2">
            {ORDER_STAGES.map((s) => (
              <form key={s.key} action={setOrderStageAction}>
                <input type="hidden" name="id" value={order.id} />
                <input type="hidden" name="stage" value={s.key} />
                <button
                  disabled={s.key === order.stage}
                  className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
                    s.key === order.stage ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
                  }`}
                >
                  {s.icon} {s.label}
                </button>
              </form>
            ))}
          </div>
        </Card>
      )}

      {canAct && !voided && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900">Art department</h2>
              <p className="text-xs text-neutral-500">Hand this order to the art team for design, customization, and proofing. The catalogue image and spec go with it.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <form action={submitToArtAction}>
                <input type="hidden" name="orderId" value={order.id} />
                <button className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50">Submit to art →</button>
              </form>
              <form action={sendToProductionAction}>
                <input type="hidden" name="orderId" value={order.id} />
                <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Send to production →</button>
              </form>
            </div>
          </div>
        </Card>
      )}

      <ProductionDetails order={order} specItems={specItems} attachments={attachments} editable={canAct} />

      <OrderProofs order={order} proofs={proofs} attachments={attachments} editable={canAct} baseUrl={base} toEmail={toEmail} />

      {canAct && (
        <Card className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900">Sales order PDF</h2>
            <form action={emailOrderPdfAction}>
              <input type="hidden" name="id" value={order.id} />
              <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">
                {artifacts.length ? "Regenerate & resend PDF" : "Generate & email PDF"}
              </button>
            </form>
          </div>
          <p className="mb-3 text-xs text-neutral-500">Generates a PDF sales order, saves it here, and emails it to the customer. Use “resend” if they didn&apos;t receive it.</p>
          <ul className="space-y-1">
            {artifacts.length === 0 && <li className="text-sm text-neutral-400">No documents generated yet.</li>}
            {artifacts.map((a) => (
              <li key={a.id} className="flex items-center justify-between text-sm">
                <a href={`/sales/orders/${order.id}/artifact/${a.id}`} target="_blank" className="font-medium text-neutral-900 hover:underline">{a.filename}</a>
                <span className="text-xs text-neutral-400">
                  {fmtDateTime(a.createdAt)} ·{" "}
                  <span className={a.sendStatus === "sent" ? "text-emerald-600" : a.sendStatus === "queued" ? "text-amber-600" : "text-neutral-500"}>
                    {a.sendStatus === "sent" ? `emailed to ${a.sentTo}` : a.sendStatus === "queued" ? "queued (email not live yet)" : "saved"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-neutral-900">Customer tracker link</h2>
          <p className="mb-3 text-xs text-neutral-500">Shareable, no login required. Send it to the customer so they can follow progress.</p>
          <CopyLink url={trackUrl} />
          <a href={mailto} className="mt-3 inline-block rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-700">✉ Email link to customer</a>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">History</h2>
          <ul className="space-y-2">
            {events.length === 0 && <li className="text-sm text-neutral-400">No events.</li>}
            {[...events].reverse().map((e) => (
              <li key={e.id} className="text-sm">
                <span className="text-neutral-800">{ORDER_STAGES.find((s) => s.key === e.stage)?.label ?? e.stage}</span>
                <span className="text-neutral-400"> · {fmtDateTime(e.at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {canAct && (
        <Card className="mt-6 border-red-200">
          <h2 className="mb-1 text-sm font-semibold text-red-800">Void order</h2>
          <p className="mb-3 text-xs text-neutral-500">Cancels this order. It stays on record with the reason. A reason is required.</p>
          <form action={voidOrderAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex-1 text-xs text-neutral-500">
              Reason
              <input name="reason" required placeholder="Why is this order being voided?" className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-500" />
            </label>
            <input type="hidden" name="id" value={order.id} />
            <ConfirmButton message="Void this order? This cancels it (kept on record with your reason)." className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">Void order</ConfirmButton>
          </form>
        </Card>
      )}
    </div>
  );
}
