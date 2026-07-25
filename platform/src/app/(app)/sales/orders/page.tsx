import Link from "next/link";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { requireModule } from "@/lib/auth/guards";
import { crmScopedToOwn } from "@/lib/rbac";
import { db } from "@/db";
import { orders, businessPartners } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { ORDER_STAGES } from "@/lib/orders/stages";

const stageLabel = (k: string) => ORDER_STAGES.find((s) => s.key === k)?.label ?? k;

export default async function OrdersPage() {
  const user = await requireModule("sales");
  const scoped = crmScopedToOwn(user.roles);
  const conditions: SQL[] = [];
  if (scoped) conditions.push(eq(orders.createdBy, user.id));

  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      stage: orders.stage,
      updatedAt: orders.updatedAt,
      company: businessPartners.companyName,
    })
    .from(orders)
    .leftJoin(businessPartners, eq(orders.bpId, businessPartners.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(orders.createdAt))
    .limit(200);

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Production orders with a customer-visible progress tracker. Orders are created when a quote is converted."
        action={<Link href="/sales" className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">Quotes</Link>}
      />
      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-5 py-2 font-medium">Order #</th>
                <th className="px-5 py-2 font-medium">Customer</th>
                <th className="px-5 py-2 font-medium">Stage</th>
                <th className="px-5 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-neutral-400">No orders yet. Convert an accepted quote to create one.</td></tr>}
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-neutral-50">
                  <td className="px-5 py-3 font-mono text-xs"><Link href={`/sales/orders/${r.id}`} className="font-medium text-neutral-900 hover:underline">{r.orderNumber}</Link></td>
                  <td className="px-5 py-3 text-neutral-700">{r.company ?? "—"}</td>
                  <td className="px-5 py-3"><span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">{stageLabel(r.stage)}</span></td>
                  <td className="px-5 py-3 text-neutral-500">{fmtDate(r.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
