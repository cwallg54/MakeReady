import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { db } from "@/db";
import { storeOrders, storeOrderItems } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { setOrderStatusAction } from "@/lib/store/actions";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const STATUSES = ["pending", "confirmed", "fulfilled", "canceled"] as const;
const inp = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand";

export default async function StoreOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireModule("web_store");
  const editable = canEdit(user.roles, "web_store");
  const { id } = await params;
  const order = await db.query.storeOrders.findFirst({ where: eq(storeOrders.id, id) });
  if (!order) notFound();
  const items = await db.select().from(storeOrderItems).where(eq(storeOrderItems.orderId, id)).orderBy(asc(storeOrderItems.title));

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/web-store/orders" className="text-sm text-neutral-500 hover:text-neutral-900">← Store orders</Link>
      <PageHeader
        title={`Order ${order.orderNumber}`}
        description={`${order.isB2b ? "B2B" : "Public"} · placed ${fmtDateTime(order.createdAt)}`}
        action={editable ? (
          <form action={setOrderStatusAction} className="flex items-center gap-2">
            <input type="hidden" name="id" value={order.id} />
            <select name="status" defaultValue={order.status} className={inp}>{STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}</select>
            <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">Update</button>
          </form>
        ) : <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold capitalize text-neutral-700">{order.status}</span>}
      />

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">Customer</h2>
        <p className="text-sm text-neutral-800">{order.contactName}</p>
        <p className="text-sm text-neutral-500">{order.contactEmail}{order.contactPhone ? ` · ${order.contactPhone}` : ""}</p>
        {order.shippingAddress && <p className="mt-2 text-sm text-neutral-600"><span className="text-xs text-neutral-400">Ship to:</span> {order.shippingAddress}</p>}
        {order.notes && <p className="mt-2 text-sm text-neutral-600"><span className="text-xs text-neutral-400">Notes:</span> {order.notes}</p>}
      </Card>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-neutral-400"><tr><th className="px-4 py-2">Item</th><th className="px-4 py-2 text-right">Unit</th><th className="px-4 py-2 text-right">Qty</th><th className="px-4 py-2 text-right">Total</th></tr></thead>
          <tbody className="divide-y divide-neutral-100">
            {items.map((i) => (
              <tr key={i.id}>
                <td className="px-4 py-2 text-neutral-800">{i.title}{i.sku ? <span className="text-neutral-400"> · {i.sku}</span> : null}</td>
                <td className="px-4 py-2 text-right tabular-nums text-neutral-500">{money(Number(i.unitPrice))}</td>
                <td className="px-4 py-2 text-right tabular-nums text-neutral-500">{i.qty}</td>
                <td className="px-4 py-2 text-right tabular-nums font-medium text-neutral-900">{money(Number(i.lineTotal))}</td>
              </tr>
            ))}
            <tr className="border-t border-neutral-200"><td colSpan={3} className="px-4 py-2 text-right text-xs font-semibold text-neutral-700">Total</td><td className="px-4 py-2 text-right text-sm font-semibold tabular-nums text-neutral-900">{money(Number(order.total))}</td></tr>
          </tbody>
        </table>
      </Card>
    </div>
  );
}
