import { eq, asc, and, or, ne, isNull } from "drizzle-orm";
import { db } from "@/db";
import { orders, orderEvents, businessPartners, orderProofs, customerDocuments } from "@/db/schema";
import { Logo } from "@/components/logo";
import { OrderTracker } from "@/components/orders/order-tracker";
import { ORDER_STAGES, type OrderStage } from "@/lib/orders/stages";
import { carrierTrackingUrl } from "@/lib/orders/shipping";
import { fmtDateTime } from "@/lib/format";
import { ProofDecisionForm } from "@/app/proof/[token]/proof-decision-form";
import { ApplicationForm } from "@/app/apply/[token]/application-form";
import { DOC_LABELS } from "@/lib/documents/meta";

export const dynamic = "force-dynamic";

const PROOF_STATUS_LABEL: Record<string, string> = {
  approved: "Approved",
  changes_requested: "Changes requested",
  declined: "Declined",
  meeting_requested: "Meeting requested",
};

export default async function TrackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const order = await db.query.orders.findFirst({ where: eq(orders.publicToken, token) });

  if (!order) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-100 px-4 text-center">
        <Logo markClassName="h-16 w-auto" className="mb-6 text-neutral-900" />
        <h1 className="text-lg font-semibold text-neutral-900">Order not found</h1>
        <p className="mt-1 text-sm text-neutral-500">This tracking link isn&apos;t valid. Please check with Great Mountain West.</p>
      </div>
    );
  }

  const bp = order.bpId ? await db.query.businessPartners.findFirst({ where: eq(businessPartners.id, order.bpId) }) : undefined;

  if (order.voidedAt) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-100 px-4 text-center">
        <Logo markClassName="h-16 w-auto" className="mb-6 text-neutral-900" />
        <p className="text-sm font-medium uppercase tracking-widest text-neutral-400">Order {order.orderNumber}</p>
        <h1 className="mt-1 text-lg font-semibold text-neutral-900">This order has been canceled</h1>
        <p className="mt-1 max-w-md text-sm text-neutral-500">Please contact Great Mountain West if you have any questions about this order.</p>
        <p className="mt-6 text-center text-xs text-neutral-400">MakeReady by G54 · Commercial Print &amp; Production</p>
      </div>
    );
  }

  const events = await db.select().from(orderEvents).where(eq(orderEvents.orderId, order.id)).orderBy(asc(orderEvents.at));
  const reachedAt: Partial<Record<OrderStage, string>> = {};
  for (const e of events) if (!reachedAt[e.stage]) reachedAt[e.stage] = fmtDateTime(e.at);
  const current = ORDER_STAGES.find((s) => s.key === order.stage)!;

  // Everything the customer still needs to act on, gathered onto this one link:
  // proofs awaiting approval + document requests awaiting submission.
  const pendingProofs = await db.select().from(orderProofs)
    .where(and(eq(orderProofs.orderId, order.id), eq(orderProofs.status, "pending")))
    .orderBy(asc(orderProofs.createdAt));

  // Docs tied to this order, plus any outstanding account-level (onboarding)
  // requests for this customer that haven't been attached to an order.
  const docScope = order.bpId
    ? or(eq(customerDocuments.orderId, order.id), and(eq(customerDocuments.bpId, order.bpId), isNull(customerDocuments.orderId)))
    : eq(customerDocuments.orderId, order.id);
  const pendingDocs = await db.select().from(customerDocuments)
    .where(and(eq(customerDocuments.status, "pending"), docScope))
    .orderBy(asc(customerDocuments.createdAt));

  const actionCount = pendingProofs.length + pendingDocs.length;

  // Completed items — a short paper trail so the customer sees what's already done.
  const doneProofs = await db.select().from(orderProofs)
    .where(and(eq(orderProofs.orderId, order.id), ne(orderProofs.status, "pending")))
    .orderBy(asc(orderProofs.respondedAt));
  const doneDocs = await db.select().from(customerDocuments)
    .where(and(eq(customerDocuments.status, "completed"), docScope))
    .orderBy(asc(customerDocuments.submittedAt));
  const hasHistory = doneProofs.length > 0 || doneDocs.length > 0;

  return (
    <div className="min-h-screen bg-neutral-100 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <Logo markClassName="h-16 w-auto" className="mb-8 text-neutral-900" />
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-medium uppercase tracking-widest text-neutral-400">Order {order.orderNumber}</p>
          <h1 className="mt-1 text-2xl font-bold text-neutral-900">
            {bp ? `${bp.companyName} — order status` : "Your order status"}
          </h1>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-neutral-900 px-4 py-1.5 text-sm font-semibold text-white">
            <span>{current.icon}</span> {current.customer}
          </div>

          <div className="mt-10 overflow-x-auto pb-2">
            <div className="min-w-[640px]">
              <OrderTracker currentStage={order.stage} reachedAt={reachedAt} variant="customer" />
            </div>
          </div>

          {(order.stage === "shipped" || order.stage === "delivered") && (order.carrier || order.trackingNumber) && (
            <div className="mt-8 rounded-xl border border-neutral-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink">Shipping</p>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-neutral-700">
                {order.carrier && <span>Carrier: <span className="font-medium text-neutral-900">{order.carrier}</span></span>}
                {order.trackingNumber && <span>Tracking: <span className="font-mono font-medium text-neutral-900">{order.trackingNumber}</span></span>}
              </div>
              {order.shippedAt && <p className="mt-1 text-xs text-neutral-400">Shipped {fmtDateTime(order.shippedAt)}{order.deliveredAt ? ` · Delivered ${fmtDateTime(order.deliveredAt)}` : ""}</p>}
              {carrierTrackingUrl(order.carrier, order.trackingNumber) && (
                <a href={carrierTrackingUrl(order.carrier, order.trackingNumber)!} target="_blank" rel="noreferrer" className="mt-3 inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Track your package →</a>
              )}
            </div>
          )}

          {/* ---- Action needed: everything awaiting the customer, right here ---- */}
          {actionCount > 0 ? (
            <div className="mt-10 rounded-xl border-2 border-amber-300 bg-amber-50/70 p-5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-400 text-sm text-white">!</span>
                <h2 className="text-base font-bold text-amber-900">
                  Action needed{actionCount > 1 ? ` — ${actionCount} items` : ""}
                </h2>
              </div>
              <p className="mt-1 text-sm text-amber-800">Please take care of the following so we can keep your order moving.</p>

              <div className="mt-4 space-y-4">
                {pendingProofs.map((proof) => (
                  <div key={proof.id} className="rounded-xl border border-blue-200 bg-white p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink">Proof ready for your approval</p>
                    <h3 className="mt-1 text-base font-semibold text-neutral-900">{proof.title}</h3>
                    {proof.message && <p className="mt-1 text-sm text-neutral-600">{proof.message}</p>}
                    {proof.attachmentId && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/proof/${proof.token}/image`} alt={proof.title} className="mt-4 max-h-[28rem] w-full rounded-lg border border-neutral-200 bg-white object-contain" />
                    )}
                    <div className="mt-4">
                      <ProofDecisionForm token={proof.token} />
                    </div>
                  </div>
                ))}

                {pendingDocs.map((doc) => (
                  <div key={doc.id} className="rounded-xl border border-blue-200 bg-white p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink">Document requested</p>
                    <h3 className="mt-1 text-base font-semibold text-neutral-900">{DOC_LABELS[doc.docType]}</h3>
                    <p className="mt-1 text-sm text-neutral-600">Please complete and submit securely — nothing you enter here is sent by email.</p>
                    <div className="mt-4">
                      <ApplicationForm token={doc.token} docType={doc.docType} defaultCompany={bp?.companyName ?? ""} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-10 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-800">
              ✓ Nothing needed from you right now — we&apos;ll let you know if anything comes up.
            </div>
          )}

          {/* ---- Completed: a short record of what's already been handled ---- */}
          {hasHistory && (
            <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 p-5">
              <h2 className="text-sm font-semibold text-neutral-900">Completed</h2>
              <ul className="mt-2 space-y-1.5 text-sm text-neutral-600">
                {doneProofs.map((p) => (
                  <li key={p.id} className="flex items-start gap-2">
                    <span className="text-emerald-600">✓</span>
                    <span>{p.title}: <span className="font-medium text-neutral-800">{PROOF_STATUS_LABEL[p.status] ?? p.status}</span>{p.respondedAt ? ` · ${fmtDateTime(p.respondedAt)}` : ""}{p.signedName ? ` · ${p.signedName}` : ""}</span>
                  </li>
                ))}
                {doneDocs.map((d) => (
                  <li key={d.id} className="flex items-start gap-2">
                    <span className="text-emerald-600">✓</span>
                    <span>{DOC_LABELS[d.docType]}: <span className="font-medium text-neutral-800">Submitted</span>{d.submittedAt ? ` · ${fmtDateTime(d.submittedAt)}` : ""}{d.signedName ? ` · ${d.signedName}` : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-8 text-xs text-neutral-400">Last updated {fmtDateTime(order.updatedAt)} · Times shown in Mountain Time.</p>
        </div>
        <p className="mt-6 text-center text-xs text-neutral-400">MakeReady by G54 · Commercial Print &amp; Production</p>
      </div>
    </div>
  );
}
