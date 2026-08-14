import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { productionOrders } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { createProductionOrderAction } from "@/lib/inventory/production-order-actions";

export const dynamic = "force-dynamic";

export default async function ProductionOrdersPage() {
  const user = await requireModule("inventory");
  const canDo = canEdit(user.roles, "inventory") || canEdit(user.roles, "accounting");
  const docs = await db.select().from(productionOrders).orderBy(desc(productionOrders.createdAt)).limit(100);

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between">
        <PageHeader title="In-house production" description="One document that pulls blanks out of stock and puts finished goods in — no separate SO + PO, no monthly journal." />
        {canDo && (
          <form action={createProductionOrderAction}>
            <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">New production order</button>
          </form>
        )}
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-400">
            <tr><th className="px-3 py-2">Doc</th><th className="px-3 py-2">Notes</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Date</th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {docs.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-neutral-400">No production orders yet.</td></tr>}
            {docs.map((d) => (
              <tr key={d.id} className="hover:bg-neutral-50">
                <td className="px-3 py-2"><Link href={`/inventory/production/${d.id}`} className="font-medium text-neutral-900 hover:underline">{d.docNumber}</Link></td>
                <td className="px-3 py-2 text-neutral-600">{d.notes ?? "—"}</td>
                <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${d.status === "posted" ? "bg-emerald-100 text-emerald-700" : "bg-neutral-200 text-neutral-600"}`}>{d.status}</span></td>
                <td className="px-3 py-2 text-neutral-500">{d.postedAt ? fmtDate(d.postedAt) : fmtDate(d.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
