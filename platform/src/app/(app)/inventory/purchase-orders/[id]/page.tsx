import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { purchaseOrders, purchaseOrderLines, goodsReceipts, vendors, bins, warehouses } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import {
  updatePoMetaAction, addPoLineAction, removePoLineAction,
  issuePoAction, voidPoAction, receivePoAction,
} from "@/lib/inventory/purchase-order-actions";

export const dynamic = "force-dynamic";
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money4 = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
const inp = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-brand";
const ERR: Record<string, string> = {
  qty: "Enter a quantity greater than zero.",
  empty: "Add at least one line before issuing the PO.",
  vendor: "Choose a vendor before issuing the PO.",
  norecv: "Enter a quantity to receive on at least one line.",
  noitem: "A line must match an inventory item before it can be received into stock.",
  nobin: "Choose a bin to receive each line into.",
};
const ymd = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "");

export default async function PurchaseOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string }> }) {
  const user = await requireModule("inventory");
  const { id } = await params;
  const { e } = await searchParams;
  const po = await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, id) });
  if (!po) notFound();

  const [lines, binRows, vendorList, receipts] = await Promise.all([
    db.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.poId, id)).orderBy(asc(purchaseOrderLines.sortOrder)),
    db.select({ id: bins.id, code: bins.code, wh: warehouses.name }).from(bins).innerJoin(warehouses, eq(warehouses.id, bins.warehouseId)).where(eq(bins.active, true)).orderBy(asc(warehouses.name), asc(bins.code)),
    db.select({ id: vendors.id, name: vendors.name }).from(vendors).orderBy(vendors.name),
    db.select({ id: goodsReceipts.id, grNumber: goodsReceipts.grNumber, receivedDate: goodsReceipts.receivedDate, notes: goodsReceipts.notes }).from(goodsReceipts).where(eq(goodsReceipts.poId, id)).orderBy(desc(goodsReceipts.receivedDate)),
  ]);
  const vendorName = vendorList.find((v) => v.id === po.vendorId)?.name;
  const editable = po.status === "draft" && (canEdit(user.roles, "inventory") || canEdit(user.roles, "accounting"));
  const canReceive = (po.status === "open" || po.status === "received") && (canEdit(user.roles, "inventory") || canEdit(user.roles, "accounting"));
  const openForRecv = lines.some((l) => Number(l.receivedQty) < Number(l.qty) - 0.005);

  const total = lines.reduce((s, l) => s + Number(l.qty) * Number(l.unitCost), 0);
  const received = lines.reduce((s, l) => s + Number(l.receivedQty) * Number(l.unitCost), 0);

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/inventory/purchase-orders" className="text-sm text-neutral-500 hover:text-neutral-900">← Purchase orders</Link>
      <PageHeader
        title={`PO · ${po.poNumber}`}
        description={vendorName ? `To ${vendorName}` : "Draft — add lines, pick a vendor, and issue."}
        action={<span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${po.status === "received" ? "bg-emerald-100 text-emerald-700" : po.status === "open" ? "bg-blue-100 text-blue-700" : po.status === "void" ? "bg-red-100 text-red-600" : "bg-neutral-200 text-neutral-600"}`}>{po.status}</span>}
      />
      {e && ERR[e] && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{ERR[e]}</p>}

      {/* Header / meta */}
      <Card>
        {editable ? (
          <form action={updatePoMetaAction.bind(null, po.id)} className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-neutral-500">Vendor
              <select name="vendorId" defaultValue={po.vendorId ?? ""} className={`mt-1 w-56 ${inp}`}>
                <option value="">— vendor —</option>
                {vendorList.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </label>
            <label className="text-xs text-neutral-500">Expected<input name="expectedDate" type="date" defaultValue={ymd(po.expectedDate)} className={`mt-1 ${inp}`} /></label>
            <label className="text-xs text-neutral-500">Notes<input name="notes" defaultValue={po.notes ?? ""} className={`mt-1 w-64 ${inp}`} /></label>
            <button className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Save</button>
          </form>
        ) : (
          <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
            <div><dt className="text-neutral-400">Vendor</dt><dd className="font-medium text-neutral-900">{vendorName ?? "—"}</dd></div>
            <div><dt className="text-neutral-400">Ordered</dt><dd className="text-neutral-700">{po.orderDate ? fmtDate(po.orderDate) : "—"}</dd></div>
            <div><dt className="text-neutral-400">Expected</dt><dd className="text-neutral-700">{po.expectedDate ? fmtDate(po.expectedDate) : "—"}</dd></div>
            {po.notes && <div><dt className="text-neutral-400">Notes</dt><dd className="text-neutral-700">{po.notes}</dd></div>}
          </div>
        )}
      </Card>

      {/* Lines */}
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">Order lines</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-neutral-400"><tr><th className="py-1">SKU</th><th>Item</th><th className="text-right">Qty</th><th className="text-right">Unit cost</th><th className="text-right">Received</th><th className="text-right">Ext.</th>{editable && <th></th>}</tr></thead>
          <tbody className="divide-y divide-neutral-100">
            {lines.length === 0 && <tr><td colSpan={editable ? 7 : 6} className="py-3 text-center text-neutral-400">No lines yet.</td></tr>}
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="py-1 pr-2 font-medium text-neutral-800">{l.sku ?? "—"}{!l.itemId && <span className="ml-1 text-[10px] text-amber-600">(unmatched)</span>}</td>
                <td className="py-1 pr-2 text-neutral-600">{l.description ?? "—"}</td>
                <td className="py-1 pr-2 text-right">{Number(l.qty)}</td>
                <td className="py-1 pr-2 text-right">{money4(Number(l.unitCost))}</td>
                <td className="py-1 pr-2 text-right text-neutral-500">{Number(l.receivedQty)}{Number(l.receivedQty) >= Number(l.qty) - 0.005 ? " ✓" : ""}</td>
                <td className="py-1 pr-2 text-right">{money(Number(l.qty) * Number(l.unitCost))}</td>
                {editable && (
                  <td className="py-1 text-right">
                    <form action={removePoLineAction.bind(null, po.id, l.id)} className="inline"><button className="text-neutral-400 hover:text-red-600" title="Remove">×</button></form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="border-t border-neutral-200 font-semibold"><td colSpan={5} className="pt-2 text-right text-neutral-500">Total</td><td className="pt-2 text-right">{money(total)}</td>{editable && <td></td>}</tr></tfoot>
        </table>

        {editable && (
          <form action={addPoLineAction.bind(null, po.id)} className="mt-2 flex flex-wrap items-end gap-2 border-t border-neutral-100 pt-2">
            <label className="text-xs text-neutral-500">SKU<input name="sku" placeholder="item SKU" className={`mt-1 w-32 ${inp}`} /></label>
            <label className="text-xs text-neutral-500">Description<input name="description" placeholder="optional" className={`mt-1 w-40 ${inp}`} /></label>
            <label className="text-xs text-neutral-500">Qty<input name="qty" type="number" step="1" className={`mt-1 w-20 ${inp}`} /></label>
            <label className="text-xs text-neutral-500">Unit cost<input name="unitCost" type="number" step="0.0001" placeholder="from item" className={`mt-1 w-24 ${inp}`} /></label>
            <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">Add line</button>
          </form>
        )}
      </Card>

      {/* Issue / void (draft) */}
      {editable && lines.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-sm text-neutral-600">Issuing opens the PO for receiving. Lines lock once issued.</p>
          <div className="flex gap-2">
            <form action={voidPoAction.bind(null, po.id)}><button className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50">Void</button></form>
            <form action={issuePoAction.bind(null, po.id)}><button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">Issue PO →</button></form>
          </div>
        </div>
      )}

      {/* Receiving (open) */}
      {canReceive && openForRecv && (
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-neutral-900">Receive goods</h2>
          <p className="mb-3 text-xs text-neutral-500">Enter the quantity received for each line and the bin it lands in. Receiving moves stock in, updates the item cost, and posts <span className="font-medium">Dr Inventory / Cr GRNI</span>. Code the vendor&rsquo;s bill to GRNI to clear it.</p>
          <form action={receivePoAction.bind(null, po.id)} className="space-y-2">
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-neutral-500">Received date<input name="receivedDate" type="date" defaultValue={ymd(new Date())} className={`mt-1 ${inp}`} /></label>
              <label className="text-xs text-neutral-500">Notes<input name="notes" placeholder="packing slip #, etc." className={`mt-1 w-56 ${inp}`} /></label>
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-neutral-400"><tr><th className="py-1">SKU</th><th className="text-right">Remaining</th><th className="text-right">Receive now</th><th>Bin</th></tr></thead>
              <tbody className="divide-y divide-neutral-100">
                {lines.filter((l) => Number(l.receivedQty) < Number(l.qty) - 0.005).map((l) => {
                  const remaining = Number(l.qty) - Number(l.receivedQty);
                  return (
                    <tr key={l.id}>
                      <td className="py-1 pr-2 font-medium text-neutral-800">{l.sku ?? "—"}{!l.itemId && <span className="ml-1 text-[10px] text-amber-600">(unmatched)</span>}</td>
                      <td className="py-1 pr-2 text-right text-neutral-500">{remaining}</td>
                      <td className="py-1 pr-2 text-right"><input name={`recv_${l.id}`} type="number" step="1" min="0" max={remaining} defaultValue={remaining} className={`w-20 text-right ${inp}`} /></td>
                      <td className="py-1">
                        <select name={`bin_${l.id}`} defaultValue={l.binId ?? ""} className={`w-44 ${inp}`}>
                          <option value="">— bin —</option>
                          {binRows.map((b) => <option key={b.id} value={b.id}>{b.wh} · {b.code}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">Receive into stock →</button>
          </form>
        </Card>
      )}

      {/* Received summary + receipts */}
      {receipts.length > 0 && (
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900">Goods receipts</h2>
            <span className="text-xs text-neutral-500">Received value: <span className="font-semibold text-neutral-900">{money(received)}</span></span>
          </div>
          <ul className="divide-y divide-neutral-100 text-sm">
            {receipts.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-1.5">
                <span className="font-medium text-neutral-800">{r.grNumber}</span>
                <span className="text-neutral-500">{r.receivedDate ? fmtDate(r.receivedDate) : "—"}{r.notes ? ` · ${r.notes}` : ""}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-neutral-400">GRNI (goods received, not invoiced) sits in the GL clearing liability until the vendor&rsquo;s A/P bill is coded to it. View the balance on the account ledger.</p>
        </Card>
      )}
    </div>
  );
}
