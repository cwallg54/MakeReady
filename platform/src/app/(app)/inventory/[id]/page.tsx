import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { inventoryItems, stockMovements, bins, warehouses, itemBinStock } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { Card, PageHeader } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { updateItemAction, deleteItemAction } from "@/lib/inventory/actions";
import { binAdjustAction, binTransferAction } from "@/lib/inventory/bin-actions";
import { fmtDateTime } from "@/lib/format";
import { rollingLandedAverage } from "@/lib/inventory/landed-cost";

export const dynamic = "force-dynamic";

const input = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-brand";
const REASON_LABEL: Record<string, string> = { receive: "Received", consume: "Consumed", adjust: "Adjusted", count: "Counted", transfer: "Transferred" };

export default async function InventoryItemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireModule("inventory");
  const editable = canEdit(user.roles, "inventory");
  const { id } = await params;

  const item = await db.query.inventoryItems.findFirst({ where: eq(inventoryItems.id, id) });
  if (!item) notFound();

  const landed = await rollingLandedAverage(id, 365);

  const [movements, allBins, stock] = await Promise.all([
    db.select().from(stockMovements).where(eq(stockMovements.itemId, id)).orderBy(desc(stockMovements.createdAt)).limit(50),
    db.select({ id: bins.id, code: bins.code, whs: warehouses.code, whsName: warehouses.name })
      .from(bins).innerJoin(warehouses, eq(warehouses.id, bins.warehouseId))
      .where(eq(bins.active, true)).orderBy(asc(warehouses.code), asc(bins.code)),
    db.select({ qty: itemBinStock.qty, binId: bins.id, binCode: bins.code, whs: warehouses.code, whsName: warehouses.name })
      .from(itemBinStock)
      .innerJoin(bins, eq(bins.id, itemBinStock.binId))
      .innerJoin(warehouses, eq(warehouses.id, bins.warehouseId))
      .where(and(eq(itemBinStock.itemId, id), gt(itemBinStock.qty, "0")))
      .orderBy(asc(warehouses.code), asc(bins.code)),
  ]);
  const low = Number(item.onHand) <= Number(item.reorderPoint) && Number(item.reorderPoint) > 0;

  // Bins grouped by warehouse for the <select> option groups.
  const byWhs = new Map<string, { code: string; id: string }[]>();
  for (const b of allBins) {
    const key = `${b.whs} — ${b.whsName}`;
    if (!byWhs.has(key)) byWhs.set(key, []);
    byWhs.get(key)!.push({ code: b.code, id: b.id });
  }
  const BinOptions = () => (
    <>
      {[...byWhs.entries()].map(([label, bs]) => (
        <optgroup key={label} label={label}>
          {bs.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}
        </optgroup>
      ))}
    </>
  );

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/inventory" className="text-sm text-neutral-500 hover:text-neutral-900">← Inventory</Link>
      <PageHeader
        title={item.name}
        description={`SKU ${item.sku}`}
        action={<span className={`rounded-full px-3 py-1 text-sm font-semibold ${low ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{Number(item.onHand)} {item.unit} on hand{low ? " · low" : ""}</span>}
      />

      {/* Stock by bin */}
      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Stock by bin</h2>
        {stock.length === 0 ? (
          <p className="text-xs text-neutral-400">Not placed in any bin yet. Use “Receive into bin” below.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-neutral-400"><tr><th className="py-1">Warehouse</th><th className="py-1">Bin</th><th className="py-1 text-right">Qty</th></tr></thead>
            <tbody className="divide-y divide-neutral-100">
              {stock.map((s) => (
                <tr key={s.binId}>
                  <td className="py-1.5 text-neutral-600">{s.whs} · {s.whsName}</td>
                  <td className="py-1.5 font-mono text-xs text-neutral-800">{s.binCode}</td>
                  <td className="py-1.5 text-right font-medium text-neutral-900">{Number(s.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {editable && allBins.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <h2 className="mb-2 text-sm font-semibold text-neutral-900">Bin activity</h2>
            <form action={binAdjustAction} className="space-y-2">
              <input type="hidden" name="itemId" value={item.id} />
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col text-xs text-neutral-500">Bin<select name="binId" className={`mt-1 ${input}`}><BinOptions /></select></label>
                <label className="flex flex-col text-xs text-neutral-500">Action
                  <select name="reason" className={`mt-1 ${input}`}>
                    <option value="receive">Receive (+)</option>
                    <option value="consume">Consume (−)</option>
                    <option value="count">Set count</option>
                    <option value="adjust">Adjust (±)</option>
                  </select>
                </label>
              </div>
              <label className="flex flex-col text-xs text-neutral-500">Quantity<input name="qty" type="number" step="0.01" className={`mt-1 ${input}`} /></label>
              <label className="flex flex-col text-xs text-neutral-500">Note<input name="note" placeholder="PO #, job, count basis" className={`mt-1 ${input}`} /></label>
              <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Apply</button>
            </form>
          </Card>

          <Card>
            <h2 className="mb-2 text-sm font-semibold text-neutral-900">Transfer between bins</h2>
            <form action={binTransferAction} className="space-y-2">
              <input type="hidden" name="itemId" value={item.id} />
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col text-xs text-neutral-500">From<select name="fromBinId" className={`mt-1 ${input}`}>{stock.map((s) => <option key={s.binId} value={s.binId}>{s.binCode} ({Number(s.qty)})</option>)}</select></label>
                <label className="flex flex-col text-xs text-neutral-500">To<select name="toBinId" className={`mt-1 ${input}`}><BinOptions /></select></label>
              </div>
              <label className="flex flex-col text-xs text-neutral-500">Quantity<input name="qty" type="number" step="0.01" className={`mt-1 ${input}`} /></label>
              <label className="flex flex-col text-xs text-neutral-500">Note<input name="note" className={`mt-1 ${input}`} /></label>
              <button className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50" disabled={stock.length === 0}>Transfer</button>
            </form>
          </Card>
        </div>
      )}

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Details</h2>
        {editable ? (
          <form action={updateItemAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="id" value={item.id} />
            <label className="flex flex-col text-xs text-neutral-500">Name<input name="name" defaultValue={item.name} className={`mt-1 ${input}`} /></label>
            <label className="flex flex-col text-xs text-neutral-500">Category<input name="category" defaultValue={item.category ?? ""} className={`mt-1 ${input}`} /></label>
            <label className="flex flex-col text-xs text-neutral-500">Territory<input name="territory" defaultValue={item.territory ?? ""} className={`mt-1 ${input}`} /></label>
            <label className="flex flex-col text-xs text-neutral-500">Unit<input name="unit" defaultValue={item.unit} className={`mt-1 ${input}`} /></label>
            <label className="flex flex-col text-xs text-neutral-500">Supplier<input name="supplier" defaultValue={item.supplier ?? ""} className={`mt-1 ${input}`} /></label>
            <label className="flex flex-col text-xs text-neutral-500">Cost<input name="cost" type="number" step="0.01" defaultValue={Number(item.cost)} className={`mt-1 ${input}`} /></label>
            <label className="flex flex-col text-xs text-neutral-500">Reorder point<input name="reorderPoint" type="number" step="0.01" defaultValue={Number(item.reorderPoint)} className={`mt-1 ${input}`} /></label>
            <label className="flex flex-col text-xs text-neutral-500">Lead time (days)<input name="leadTimeDays" type="number" defaultValue={item.leadTimeDays} className={`mt-1 ${input}`} /></label>
            <label className="flex items-center gap-2 text-xs text-neutral-600"><input type="checkbox" name="isImport" defaultChecked={item.isImport} className="h-4 w-4" /> Imported item</label>
            <label className="flex flex-col text-xs text-neutral-500 sm:col-span-2">Notes<input name="notes" defaultValue={item.notes ?? ""} className={`mt-1 ${input}`} /></label>
            <label className="flex items-center gap-2 text-sm text-neutral-700"><input type="checkbox" name="active" defaultChecked={item.active} className="h-4 w-4" /> Active</label>
            <div className="sm:col-span-2"><button className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Save details</button></div>
          </form>
        ) : (
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div><dt className="text-neutral-400">Category</dt><dd className="text-neutral-800">{item.category ?? "—"}</dd></div>
            <div><dt className="text-neutral-400">Supplier</dt><dd className="text-neutral-800">{item.supplier ?? "—"}</dd></div>
            <div><dt className="text-neutral-400">Cost</dt><dd className="text-neutral-800">${Number(item.cost).toFixed(2)}</dd></div>
            <div><dt className="text-neutral-400">Reorder point</dt><dd className="text-neutral-800">{Number(item.reorderPoint)}</dd></div>
          </dl>
        )}
      </Card>

      {landed.current != null && (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-neutral-900">Landed cost <span className="font-normal text-neutral-400">(rolling 365 days)</span></h2>
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <div><dt className="text-neutral-400">365-day avg landed</dt><dd className="text-lg font-bold text-neutral-900">${landed.current.toFixed(4)}</dd></div>
            <div><dt className="text-neutral-400">Prior year</dt><dd className="text-neutral-700">{landed.priorYear != null ? `$${landed.priorYear.toFixed(4)}` : "—"}</dd></div>
            {landed.priorYear != null && landed.priorYear > 0 && (
              <div><dt className="text-neutral-400">YoY</dt><dd className={landed.current >= landed.priorYear ? "text-red-600" : "text-emerald-600"}>{landed.current >= landed.priorYear ? "▲" : "▼"} {(Math.abs((landed.current - landed.priorYear) / landed.priorYear) * 100).toFixed(1)}%</dd></div>
            )}
            <div><dt className="text-neutral-400">Units landed (365d)</dt><dd className="text-neutral-700">{landed.qtyCurrent}</dd></div>
          </div>
          <p className="mt-2 text-xs text-neutral-400">Weighted average of applied landed-cost sheets over the last year — not an all-time average.</p>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Movement history</h2>
        {movements.length === 0 ? (
          <p className="text-xs text-neutral-400">No movements yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-neutral-400"><tr><th className="py-1">When</th><th className="py-1">Action</th><th className="py-1 text-right">Change</th><th className="py-1">Note</th></tr></thead>
            <tbody className="divide-y divide-neutral-100">
              {movements.map((m) => (
                <tr key={m.id}>
                  <td className="py-1.5 text-neutral-500">{fmtDateTime(m.createdAt)}</td>
                  <td className="py-1.5 text-neutral-700">{REASON_LABEL[m.reason] ?? m.reason}</td>
                  <td className={`py-1.5 text-right font-medium ${Number(m.delta) < 0 ? "text-red-600" : "text-emerald-700"}`}>{Number(m.delta) > 0 ? "+" : ""}{Number(m.delta)}</td>
                  <td className="py-1.5 text-neutral-400">{m.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {editable && (
        <form action={deleteItemAction}>
          <input type="hidden" name="id" value={item.id} />
          <ConfirmButton message="Delete this item and its movement history? This cannot be undone." className="text-xs text-red-600 hover:text-red-800">Delete item</ConfirmButton>
        </form>
      )}
    </div>
  );
}
