import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { landedCostDocs } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { createLandedDocAction } from "@/lib/inventory/landed-actions";

export const dynamic = "force-dynamic";
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function LandedCostListPage() {
  const user = await requireModule("inventory");
  const canDo = canEdit(user.roles, "accounting") || canEdit(user.roles, "inventory");
  const docs = await db.select().from(landedCostDocs).orderBy(desc(landedCostDocs.createdAt)).limit(100);

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between">
        <PageHeader title="Landed cost" description="Spread freight (and duty/brokerage) across a shipment so each item's cost is true landed cost." />
        {canDo && (
          <form action={createLandedDocAction}>
            <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">New landed-cost sheet</button>
          </form>
        )}
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-400">
            <tr><th className="px-3 py-2">Doc</th><th className="px-3 py-2">Vendor / shipment</th><th className="px-3 py-2">Freight + other</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Date</th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {docs.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-neutral-400">No landed-cost sheets yet.</td></tr>}
            {docs.map((d) => (
              <tr key={d.id} className="hover:bg-neutral-50">
                <td className="px-3 py-2"><Link href={`/accounting/landed-cost/${d.id}`} className="font-medium text-neutral-900 hover:underline">{d.docNumber}</Link></td>
                <td className="px-3 py-2 text-neutral-600">{[d.vendor, d.shipmentRef].filter(Boolean).join(" · ") || "—"}</td>
                <td className="px-3 py-2 text-neutral-700">{money(Number(d.freightAmount) + Number(d.otherCharges))}</td>
                <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${d.status === "applied" ? "bg-emerald-100 text-emerald-700" : "bg-neutral-200 text-neutral-600"}`}>{d.status}</span></td>
                <td className="px-3 py-2 text-neutral-500">{d.appliedAt ? fmtDate(d.appliedAt) : fmtDate(d.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
