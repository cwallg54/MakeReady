import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { storeOrders, storeOrderItems } from "@/db/schema";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const STATUS: Record<string, string> = { pending: "Received — pending confirmation", confirmed: "Confirmed", fulfilled: "Fulfilled", canceled: "Canceled" };

export default async function OrderConfirmationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await db.query.storeOrders.findFirst({ where: eq(storeOrders.id, id) });
  if (!order) notFound();
  const items = await db.select().from(storeOrderItems).where(eq(storeOrderItems.orderId, id)).orderBy(asc(storeOrderItems.title));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-6 text-center">
        <div className="text-3xl">✅</div>
        <h1 className="mt-2 text-xl font-bold text-emerald-900">Order placed — {order.orderNumber}</h1>
        <p className="mt-1 text-sm text-emerald-800">Thanks, {order.contactName}. We've received your order and our team will confirm it shortly. No payment was taken online.</p>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between text-sm">
          <span className="text-neutral-500">Placed {fmtDate(order.createdAt)}</span>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-700">{STATUS[order.status] ?? order.status}</span>
        </div>
        <ul className="divide-y divide-neutral-100 text-sm">
          {items.map((i) => (
            <li key={i.id} className="flex justify-between gap-2 py-2">
              <span className="text-neutral-700">{i.qty}× {i.title}{i.sku ? <span className="text-neutral-400"> · {i.sku}</span> : null}</span>
              <span className="shrink-0 tabular-nums text-neutral-900">{money(Number(i.lineTotal))}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex justify-between border-t border-neutral-200 pt-2 text-sm font-semibold">
          <span>Subtotal</span><span className="tabular-nums">{money(Number(order.total))}</span>
        </div>
        {order.shippingAddress && <p className="mt-3 text-xs text-neutral-500">Ship to: {order.shippingAddress}</p>}
      </div>

      <div className="text-center">
        <Link href="/shop" className="text-sm font-medium text-brand-ink hover:underline">Continue shopping →</Link>
      </div>
    </div>
  );
}
