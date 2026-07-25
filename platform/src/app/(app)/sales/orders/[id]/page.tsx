import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { db } from "@/db";
import { orders, orderEvents, orderArtifacts, orderSpecItems, orderAttachments, businessPartners, contacts } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { OrderTracker } from "@/components/orders/order-tracker";
import { ProductionDetails } from "@/components/orders/production-details";
import { CopyLink } from "@/components/orders/copy-link";
import { ORDER_STAGES, type OrderStage } from "@/lib/orders/stages";
import { setOrderStageAction, emailOrderPdfAction } from "@/lib/orders/actions";
import { desc } from "drizzle-orm";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireModule("sales");
  const { id } = await params;
  const editable = canEdit(user.roles, "sales");

  const order = await db.query.orders.findFirst({ where: eq(orders.id, id) });
  if (!order) notFound();
  const [bp, events, artifacts, specItems, attachments] = await Promise.all([
    order.bpId ? db.query.businessPartners.findFirst({ where: eq(businessPartners.id, order.bpId) }) : Promise.resolve(undefined),
    db.select().from(orderEvents).where(eq(orderEvents.orderId, id)).orderBy(asc(orderEvents.at)),
    db.select().from(orderArtifacts).where(eq(orderArtifacts.orderId, id)).orderBy(desc(orderArtifacts.createdAt)),
    db.select().from(orderSpecItems).where(eq(orderSpecItems.orderId, id)).orderBy(asc(orderSpecItems.sortOrder)),
    db.select().from(orderAttachments).where(eq(orderAttachments.orderId, id)).orderBy(desc(orderAttachments.createdAt)),
  ]);

  const reachedAt: Partial<Record<OrderStage, string>> = {};
  for (const e of events) if (!reachedAt[e.stage]) reachedAt[e.stage] = fmtDateTime(e.at);

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

      <Card className="mb-6">
        <OrderTracker currentStage={order.stage} reachedAt={reachedAt} />
      </Card>

      {editable && (
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

      <ProductionDetails order={order} specItems={specItems} attachments={attachments} editable={editable} />

      {editable && (
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
    </div>
  );
}
