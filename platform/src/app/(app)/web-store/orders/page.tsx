import Link from "next/link";
import { desc, eq, sql, type SQL } from "drizzle-orm";
import { requireModule } from "@/lib/auth/guards";
import { db } from "@/db";
import { storeOrders } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const STATUSES = ["pending", "confirmed", "fulfilled", "canceled"] as const;
const BADGE: Record<string, string> = { pending: "bg-amber-100 text-amber-700", confirmed: "bg-blue-100 text-blue-700", fulfilled: "bg-emerald-100 text-emerald-700", canceled: "bg-red-100 text-red-700" };

export default async function StoreOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireModule("web_store");
  const sp = await searchParams;
  const filter = STATUSES.includes(sp.status as (typeof STATUSES)[number]) ? sp.status : null;

  const where: SQL | undefined = filter ? eq(storeOrders.status, filter as (typeof STATUSES)[number]) : undefined;
  const [rows, counts] = await Promise.all([
    db.select().from(storeOrders).where(where).orderBy(desc(storeOrders.createdAt)).limit(200),
    db.select({ status: storeOrders.status, n: sql<number>`count(*)::int` }).from(storeOrders).groupBy(storeOrders.status),
  ]);
  const countOf = (s: string) => counts.find((c) => c.status === s)?.n ?? 0;

  return (
    <div className="max-w-5xl space-y-6">
      <Link href="/web-store" className="text-sm text-neutral-500 hover:text-neutral-900">← Web Store</Link>
      <PageHeader title="Store orders" description="Orders placed through the storefront (on-account / request — no online payment)." />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href="/web-store/orders" className={`rounded-md border px-3 py-1 ${!filter ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"}`}>All</Link>
        {STATUSES.map((s) => (
          <Link key={s} href={`/web-store/orders?status=${s}`} className={`rounded-md border px-3 py-1 capitalize ${filter === s ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"}`}>{s} ({countOf(s)})</Link>
        ))}
      </div>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-neutral-400"><tr><th className="px-4 py-2">Order</th><th className="px-4 py-2">Customer</th><th className="px-4 py-2">Type</th><th className="px-4 py-2">Placed</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2">Status</th></tr></thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-neutral-400">No orders{filter ? ` (${filter})` : ""} yet.</td></tr>}
            {rows.map((o) => (
              <tr key={o.id} className="hover:bg-neutral-50">
                <td className="px-4 py-2"><Link href={`/web-store/orders/${o.id}`} className="font-mono text-xs font-medium text-brand-ink hover:underline">{o.orderNumber}</Link></td>
                <td className="px-4 py-2 text-neutral-800">{o.contactName ?? "—"}<span className="block text-xs text-neutral-400">{o.contactEmail}</span></td>
                <td className="px-4 py-2 text-xs text-neutral-500">{o.isB2b ? "B2B" : "Public"}</td>
                <td className="px-4 py-2 text-neutral-500">{fmtDate(o.createdAt)}</td>
                <td className="px-4 py-2 text-right tabular-nums font-medium text-neutral-900">{money(Number(o.total))}</td>
                <td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${BADGE[o.status]}`}>{o.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
