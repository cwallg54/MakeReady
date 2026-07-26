import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { inventoryItems, stockMovements } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { Card, PageHeader } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { updateItemAction, adjustStockAction, deleteItemAction } from "@/lib/inventory/actions";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const input = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-neutral-500";
const REASON_LABEL: Record<string, string> = { receive: "Received", consume: "Consumed", adjust: "Adjusted", count: "Counted" };

export default async function InventoryItemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireModule("inventory");
  const editable = canEdit(user.roles, "inventory");
  const { id } = await params;

  const item = await db.query.inventoryItems.findFirst({ where: eq(inventoryItems.id, id) });
  if (!item) notFound();
  const movements = await db.select().from(stockMovements).where(eq(stockMovements.itemId, id)).orderBy(desc(stockMovements.createdAt));
  const low = Number(item.onHand) <= Number(item.reorderPoint) && Number(item.reorderPoint) > 0;

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/inventory" className="text-sm text-neutral-500 hover:text-neutral-900">← Inventory</Link>
      <PageHeader
        title={item.name}
        description={`SKU ${item.sku}`}
        action={<span className={`rounded-full px-3 py-1 text-sm font-semibold ${low ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{Number(item.onHand)} {item.unit} on hand{low ? " · low" : ""}</span>}
      />

      {editable && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Adjust stock</h2>
          <form action={adjustStockAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={item.id} />
            <label className="flex flex-col text-xs text-neutral-500">Action
              <select name="reason" className={`mt-1 ${input}`}>
                <option value="receive">Receive (+)</option>
                <option value="consume">Consume (−)</option>
                <option value="count">Set count</option>
                <option value="adjust">Adjust (±)</option>
              </select>
            </label>
            <label className="flex flex-col text-xs text-neutral-500">Quantity
              <input name="qty" type="number" step="0.01" className={`mt-1 w-28 ${input}`} />
            </label>
            <label className="flex flex-1 flex-col text-xs text-neutral-500">Note
              <input name="note" placeholder="e.g. PO #, job, count basis" className={`mt-1 ${input}`} />
            </label>
            <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Apply</button>
          </form>
          <p className="mt-2 text-xs text-neutral-400">Receive adds, Consume subtracts, Set count sets the on-hand to the entered value, Adjust applies a signed change.</p>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Details</h2>
        {editable ? (
          <form action={updateItemAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="id" value={item.id} />
            <label className="flex flex-col text-xs text-neutral-500">Name<input name="name" defaultValue={item.name} className={`mt-1 ${input}`} /></label>
            <label className="flex flex-col text-xs text-neutral-500">Category<input name="category" defaultValue={item.category ?? ""} className={`mt-1 ${input}`} /></label>
            <label className="flex flex-col text-xs text-neutral-500">Unit<input name="unit" defaultValue={item.unit} className={`mt-1 ${input}`} /></label>
            <label className="flex flex-col text-xs text-neutral-500">Supplier<input name="supplier" defaultValue={item.supplier ?? ""} className={`mt-1 ${input}`} /></label>
            <label className="flex flex-col text-xs text-neutral-500">Cost<input name="cost" type="number" step="0.01" defaultValue={Number(item.cost)} className={`mt-1 ${input}`} /></label>
            <label className="flex flex-col text-xs text-neutral-500">Reorder point<input name="reorderPoint" type="number" step="0.01" defaultValue={Number(item.reorderPoint)} className={`mt-1 ${input}`} /></label>
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
