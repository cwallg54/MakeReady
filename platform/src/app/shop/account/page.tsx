import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { storeOrders } from "@/db/schema";
import { getCurrentCustomer } from "@/lib/store/customer-auth";
import { logoutAction } from "@/lib/store/storefront-actions";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const STATUS: Record<string, string> = { pending: "Pending", confirmed: "Confirmed", fulfilled: "Fulfilled", canceled: "Canceled" };

export default async function AccountPage() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/shop/login");
  const orders = await db.select().from(storeOrders).where(eq(storeOrders.customerId, customer.id)).orderBy(desc(storeOrders.createdAt)).limit(50);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-neutral-900">My account</h1>
        <form action={logoutAction}><button className="text-sm font-medium text-neutral-500 hover:text-neutral-900">Sign out</button></form>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-4 text-sm">
        <p className="font-medium text-neutral-900">{customer.name}</p>
        <p className="text-neutral-500">{customer.email}{customer.companyName ? ` · ${customer.companyName}` : ""}</p>
        <p className="mt-1 text-xs text-emerald-700">Business Partner — account pricing applied at checkout.</p>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">Order history</h2>
        {orders.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 py-10 text-center text-sm text-neutral-400">No orders yet. <Link href="/shop" className="text-brand-ink hover:underline">Start shopping →</Link></div>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
            {orders.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 p-3">
                <div>
                  <Link href={`/shop/order/${o.id}`} className="text-sm font-medium text-brand-ink hover:underline">{o.orderNumber}</Link>
                  <div className="text-xs text-neutral-500">{fmtDate(o.createdAt)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-neutral-900">{money(Number(o.total))}</div>
                  <div className="text-xs text-neutral-500">{STATUS[o.status] ?? o.status}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
