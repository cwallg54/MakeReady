import { eq, asc } from "drizzle-orm";
import { db } from "@/db";
import { orders, orderEvents, businessPartners } from "@/db/schema";
import { Logo } from "@/components/logo";
import { OrderTracker } from "@/components/orders/order-tracker";
import { ORDER_STAGES, type OrderStage } from "@/lib/orders/stages";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TrackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const order = await db.query.orders.findFirst({ where: eq(orders.publicToken, token) });

  if (!order) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-100 px-4 text-center">
        <Logo markClassName="h-10 w-auto" className="mb-6 text-neutral-900" />
        <h1 className="text-lg font-semibold text-neutral-900">Order not found</h1>
        <p className="mt-1 text-sm text-neutral-500">This tracking link isn&apos;t valid. Please check with Great Mountain West.</p>
      </div>
    );
  }

  const bp = order.bpId ? await db.query.businessPartners.findFirst({ where: eq(businessPartners.id, order.bpId) }) : undefined;

  if (order.voidedAt) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-100 px-4 text-center">
        <Logo markClassName="h-10 w-auto" className="mb-6 text-neutral-900" />
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

  return (
    <div className="min-h-screen bg-neutral-100 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <Logo markClassName="h-10 w-auto" className="mb-8 text-neutral-900" />
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

          <p className="mt-8 text-xs text-neutral-400">Last updated {fmtDateTime(order.updatedAt)} · Times shown in Mountain Time.</p>
        </div>
        <p className="mt-6 text-center text-xs text-neutral-400">MakeReady by G54 · Commercial Print &amp; Production</p>
      </div>
    </div>
  );
}
