import Link from "next/link";
import { and, gte, lte, isNull, eq, asc } from "drizzle-orm";
import { db } from "@/db";
import { orders, users, businessPartners } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { PageHeader, Card } from "@/components/ui";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inp = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand";
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default async function CommissionReportPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireModule("accounting");
  const sp = await searchParams;
  const now = new Date();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : ymd(new Date(now.getFullYear(), now.getMonth(), 1));
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  const rows = await db
    .select({ id: orders.id, orderNumber: orders.orderNumber, createdAt: orders.createdAt, orderType: orders.orderType, amount: orders.amount, repId: orders.salesRepId, repName: users.name, company: businessPartners.companyName })
    .from(orders)
    .leftJoin(users, eq(users.id, orders.salesRepId))
    .leftJoin(businessPartners, eq(businessPartners.id, orders.bpId))
    .where(and(isNull(orders.voidedAt), gte(orders.createdAt, new Date(from + "T00:00:00")), lte(orders.createdAt, new Date(to + "T23:59:59"))))
    .orderBy(asc(orders.createdAt));

  // Group by sales rep.
  const groups = new Map<string, { name: string; total: number; orders: typeof rows }>();
  for (const r of rows) {
    const key = r.repId ?? "__none";
    if (!groups.has(key)) groups.set(key, { name: r.repId ? r.repName ?? "—" : "Unassigned", total: 0, orders: [] });
    const g = groups.get(key)!;
    g.total += Number(r.amount);
    g.orders.push(r);
  }
  const list = [...groups.values()].sort((a, b) => b.total - a.total);
  const grandTotal = list.reduce((s, g) => s + g.total, 0);

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/accounting" className="text-sm text-neutral-500 hover:text-neutral-900">← Accounting</Link>
      <PageHeader title="Commission report" description="Order sales by salesperson for a period (the commissionable base) — expand a rep to see their orders." />

      <form className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-neutral-500">From<input type="date" name="from" defaultValue={from} className={`mt-1 block ${inp}`} /></label>
        <label className="text-xs text-neutral-500">To<input type="date" name="to" defaultValue={to} className={`mt-1 block ${inp}`} /></label>
        <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">Run</button>
      </form>

      <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-3">
        <span className="text-sm text-neutral-500">Total sales · {fmtDate(new Date(from + "T12:00:00"))} – {fmtDate(new Date(to + "T12:00:00"))}</span>
        <span className="text-xl font-bold text-neutral-900">{money(grandTotal)}</span>
      </div>

      {list.length === 0 ? (
        <Card><p className="text-center text-sm text-neutral-400">No orders in this period.</p></Card>
      ) : (
        <div className="space-y-2">
          {list.map((g) => (
            <Card key={g.name} className="p-0">
              <details>
                <summary className="flex cursor-pointer items-center justify-between px-4 py-3">
                  <span className="font-medium text-neutral-900">{g.name} <span className="text-xs font-normal text-neutral-400">· {g.orders.length} order{g.orders.length === 1 ? "" : "s"}</span></span>
                  <span className="font-semibold text-neutral-900">{money(g.total)}</span>
                </summary>
                <table className="w-full border-t border-neutral-100 text-sm">
                  <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-400"><tr><th className="px-4 py-1.5">Order</th><th className="px-4 py-1.5">Customer</th><th className="px-4 py-1.5">Type</th><th className="px-4 py-1.5">Date</th><th className="px-4 py-1.5 text-right">Amount</th></tr></thead>
                  <tbody className="divide-y divide-neutral-100">
                    {g.orders.map((o) => (
                      <tr key={o.id}>
                        <td className="px-4 py-1.5"><Link href={`/sales/orders/${o.id}`} className="font-medium text-neutral-800 hover:underline">{o.orderNumber}</Link></td>
                        <td className="px-4 py-1.5 text-neutral-600">{o.company ?? "—"}</td>
                        <td className="px-4 py-1.5 text-neutral-500">{o.orderType ?? "—"}</td>
                        <td className="px-4 py-1.5 text-neutral-500">{fmtDate(o.createdAt)}</td>
                        <td className="px-4 py-1.5 text-right">{money(Number(o.amount))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </Card>
          ))}
        </div>
      )}
      <p className="text-xs text-neutral-400">Sales by salesperson (order amount, non-void). Apply each rep&rsquo;s commission rate to their total.</p>
    </div>
  );
}
