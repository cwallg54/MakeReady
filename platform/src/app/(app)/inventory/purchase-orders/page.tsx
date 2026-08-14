import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { purchaseOrders, purchaseOrderLines, vendors } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { createPurchaseOrderAction } from "@/lib/inventory/purchase-order-actions";

export const dynamic = "force-dynamic";
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inp = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-brand";
const TONE: Record<string, string> = {
  draft: "bg-neutral-200 text-neutral-600", open: "bg-blue-100 text-blue-700",
  received: "bg-emerald-100 text-emerald-700", closed: "bg-neutral-200 text-neutral-500", void: "bg-red-100 text-red-600",
};

export default async function PurchaseOrdersPage() {
  const user = await requireModule("inventory");
  const editable = canEdit(user.roles, "inventory") || canEdit(user.roles, "accounting");

  const rows = await db
    .select({
      id: purchaseOrders.id, poNumber: purchaseOrders.poNumber, status: purchaseOrders.status,
      orderDate: purchaseOrders.orderDate, expectedDate: purchaseOrders.expectedDate, vendor: vendors.name,
      value: sql<string>`COALESCE((SELECT SUM(${purchaseOrderLines.qty} * ${purchaseOrderLines.unitCost}) FROM ${purchaseOrderLines} WHERE ${purchaseOrderLines.poId} = ${purchaseOrders.id}), 0)`,
      recvPct: sql<string>`COALESCE((SELECT CASE WHEN SUM(${purchaseOrderLines.qty}) > 0 THEN SUM(${purchaseOrderLines.receivedQty}) / SUM(${purchaseOrderLines.qty}) ELSE 0 END FROM ${purchaseOrderLines} WHERE ${purchaseOrderLines.poId} = ${purchaseOrders.id}), 0)`,
    })
    .from(purchaseOrders).leftJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
    .orderBy(desc(purchaseOrders.createdAt)).limit(200);

  const vendorList = await db.select({ id: vendors.id, name: vendors.name }).from(vendors).orderBy(vendors.name);
  const openValue = rows.filter((r) => r.status === "open").reduce((s, r) => s + Number(r.value), 0);

  return (
    <div className="max-w-5xl space-y-6">
      <Link href="/inventory" className="text-sm text-neutral-500 hover:text-neutral-900">← Inventory</Link>
      <PageHeader title="Purchase orders" description="Raise POs to vendors, receive goods into stock, and let the bill clear the GRNI balance." />

      {editable && (
        <Card>
          <form action={createPurchaseOrderAction} className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-neutral-500">Vendor
              <select name="vendorId" className={`mt-1 w-56 ${inp}`}>
                <option value="">— vendor —</option>
                {vendorList.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </label>
            <label className="text-xs text-neutral-500">Expected<input name="expectedDate" type="date" className={`mt-1 ${inp}`} /></label>
            <label className="text-xs text-neutral-500">Notes<input name="notes" placeholder="optional" className={`mt-1 w-48 ${inp}`} /></label>
            <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">New PO</button>
          </form>
        </Card>
      )}

      <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-3">
        <span className="text-sm text-neutral-500">Open PO value (on order)</span>
        <span className="text-xl font-bold text-neutral-900">{money(openValue)}</span>
      </div>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-400"><tr><th className="px-4 py-2">PO</th><th className="px-4 py-2">Vendor</th><th className="px-4 py-2">Ordered</th><th className="px-4 py-2">Expected</th><th className="px-4 py-2 text-right">Value</th><th className="px-4 py-2 text-right">Received</th><th className="px-4 py-2">Status</th></tr></thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-neutral-400">No purchase orders yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-neutral-50">
                <td className="px-4 py-2"><Link href={`/inventory/purchase-orders/${r.id}`} className="font-medium text-neutral-900 hover:underline">{r.poNumber}</Link></td>
                <td className="px-4 py-2 text-neutral-600">{r.vendor ?? "—"}</td>
                <td className="px-4 py-2 text-neutral-500">{r.orderDate ? fmtDate(r.orderDate) : "—"}</td>
                <td className="px-4 py-2 text-neutral-500">{r.expectedDate ? fmtDate(r.expectedDate) : "—"}</td>
                <td className="px-4 py-2 text-right">{money(Number(r.value))}</td>
                <td className="px-4 py-2 text-right text-neutral-500">{Math.round(Number(r.recvPct) * 100)}%</td>
                <td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TONE[r.status] ?? "bg-neutral-100 text-neutral-500"}`}>{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
