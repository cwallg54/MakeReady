import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { storeOrders, quotes, orders, invoices } from "@/db/schema";
import { getCurrentCustomer } from "@/lib/store/customer-auth";
import { logoutAction } from "@/lib/store/storefront-actions";
import { ORDER_STAGES } from "@/lib/orders/stages";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const STORE_STATUS: Record<string, string> = { pending: "Pending", confirmed: "Confirmed", fulfilled: "Fulfilled", canceled: "Canceled" };
const QUOTE_BADGE: Record<string, string> = { draft: "bg-neutral-200 text-neutral-600", sent: "bg-blue-100 text-blue-700", approved: "bg-emerald-100 text-emerald-700", declined: "bg-red-100 text-red-700", expired: "bg-neutral-200 text-neutral-500" };
const INV_BADGE: Record<string, string> = { draft: "bg-neutral-200 text-neutral-600", sent: "bg-blue-100 text-blue-700", partial: "bg-amber-100 text-amber-700", paid: "bg-emerald-100 text-emerald-700", void: "bg-red-100 text-red-700" };
const stageLabel = (s: string) => ORDER_STAGES.find((x) => x.key === s)?.label ?? s;

export default async function AccountPage() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/shop/login");
  const bpId = customer.bpId;

  const [quoteRows, orderRows, invoiceRows, storeOrderRows] = await Promise.all([
    bpId ? db.select({ id: quotes.id, quoteNumber: quotes.quoteNumber, status: quotes.status, total: quotes.total, createdAt: quotes.createdAt, publicToken: quotes.publicToken }).from(quotes).where(eq(quotes.bpId, bpId)).orderBy(desc(quotes.createdAt)).limit(20) : Promise.resolve([]),
    bpId ? db.select({ id: orders.id, orderNumber: orders.orderNumber, stage: orders.stage, publicToken: orders.publicToken, createdAt: orders.createdAt }).from(orders).where(eq(orders.bpId, bpId)).orderBy(desc(orders.createdAt)).limit(20) : Promise.resolve([]),
    bpId ? db.select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber, status: invoices.status, total: invoices.total, dueDate: invoices.dueDate }).from(invoices).where(eq(invoices.bpId, bpId)).orderBy(desc(invoices.createdAt)).limit(20) : Promise.resolve([]),
    db.select().from(storeOrders).where(eq(storeOrders.customerId, customer.id)).orderBy(desc(storeOrders.createdAt)).limit(20),
  ]);

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

      {/* Quotes */}
      {quoteRows.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-neutral-900">Your quotes</h2>
          <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
            {quoteRows.map((q) => (
              <li key={q.id} className="flex items-center justify-between gap-3 p-3">
                <div>
                  <span className="text-sm font-medium text-neutral-900">{q.quoteNumber}</span>
                  <div className="text-xs text-neutral-500">{fmtDate(q.createdAt)}{q.status === "sent" ? " · awaiting your approval" : ""}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-neutral-900">{money(Number(q.total))}</span>
                  {q.status === "sent" && q.publicToken ? (
                    <Link href={`/quote/${q.publicToken}`} className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-700">Review &amp; approve →</Link>
                  ) : (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${QUOTE_BADGE[q.status] ?? "bg-neutral-100 text-neutral-600"}`}>{q.status}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Production orders — with the tracking link */}
      {orderRows.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-neutral-900">Your orders</h2>
          <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
            {orderRows.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 p-3">
                <div>
                  <span className="text-sm font-medium text-neutral-900">{o.orderNumber}</span>
                  <div className="text-xs text-neutral-500">{fmtDate(o.createdAt)} · {stageLabel(o.stage)}</div>
                </div>
                <Link href={`/track/${o.publicToken}`} className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-brand-ink hover:bg-neutral-50">Track order →</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Invoices */}
      {invoiceRows.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-neutral-900">Your invoices</h2>
          <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
            {invoiceRows.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 p-3">
                <div>
                  <span className="text-sm font-medium text-neutral-900">{inv.invoiceNumber}</span>
                  <div className="text-xs text-neutral-500">{inv.dueDate ? `Due ${fmtDate(inv.dueDate)}` : ""}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-neutral-900">{money(Number(inv.total))}</span>
                  {inv.status !== "paid" && inv.status !== "void" ? (
                    <Link href={`/shop/pay/${inv.id}`} className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-700">Pay</Link>
                  ) : (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${INV_BADGE[inv.status] ?? "bg-neutral-100 text-neutral-600"}`}>{inv.status}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Web-store order history */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">Store orders</h2>
        {storeOrderRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 py-10 text-center text-sm text-neutral-400">No store orders yet. <Link href="/shop" className="text-brand-ink hover:underline">Start shopping →</Link></div>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
            {storeOrderRows.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 p-3">
                <div>
                  <Link href={`/shop/order/${o.id}`} className="text-sm font-medium text-brand-ink hover:underline">{o.orderNumber}</Link>
                  <div className="text-xs text-neutral-500">{fmtDate(o.createdAt)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-neutral-900">{money(Number(o.total))}</div>
                  <div className="text-xs text-neutral-500">{STORE_STATUS[o.status] ?? o.status}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
