import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { inventoryItems } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { Card, PageHeader } from "@/components/ui";
import { ItemCreateForm } from "./item-create-form";

export const dynamic = "force-dynamic";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ q?: string; low?: string }> }) {
  const user = await requireModule("inventory");
  const editable = canEdit(user.roles, "inventory");
  const { q, low } = await searchParams;

  let items = await db.select().from(inventoryItems).orderBy(asc(inventoryItems.name));
  if (q) {
    const needle = q.toLowerCase();
    items = items.filter((i) => i.name.toLowerCase().includes(needle) || i.sku.toLowerCase().includes(needle) || (i.category ?? "").toLowerCase().includes(needle));
  }
  const isLow = (i: (typeof items)[number]) => Number(i.onHand) <= Number(i.reorderPoint) && Number(i.reorderPoint) > 0;
  if (low === "1") items = items.filter(isLow);
  const lowCount = items.filter(isLow).length;

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader title="Inventory" description="Item master and stock levels." />

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-neutral-900">Item master</h2>
          <form className="flex items-center gap-2">
            <input name="q" defaultValue={q ?? ""} placeholder="Search name / SKU / category" className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-neutral-500" />
            <label className="flex items-center gap-1 text-xs text-neutral-600"><input type="checkbox" name="low" value="1" defaultChecked={low === "1"} className="h-4 w-4" /> Low stock only</label>
            <button className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Filter</button>
          </form>
        </div>
        {lowCount > 0 && low !== "1" && <p className="mb-2 text-xs font-medium text-amber-600">{lowCount} item{lowCount > 1 ? "s" : ""} at or below reorder point.</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-400">
              <tr>
                <th className="px-3 py-2">SKU</th><th className="px-3 py-2">Item</th><th className="px-3 py-2">Category</th>
                <th className="px-3 py-2 text-right">On hand</th><th className="px-3 py-2 text-right">Reorder</th><th className="px-3 py-2 text-right">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {items.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-neutral-400">No items{q || low ? " match the filter" : " yet"}.</td></tr>}
              {items.map((i) => (
                <tr key={i.id} className="hover:bg-neutral-50">
                  <td className="px-3 py-2 font-mono text-xs text-neutral-500">{i.sku}</td>
                  <td className="px-3 py-2"><Link href={`/inventory/${i.id}`} className="font-medium text-neutral-900 hover:underline">{i.name}</Link>{!i.active && <span className="ml-2 text-[10px] text-neutral-400">(inactive)</span>}</td>
                  <td className="px-3 py-2 text-neutral-500">{i.category ?? "—"}</td>
                  <td className={`px-3 py-2 text-right font-medium ${isLow(i) ? "text-amber-600" : "text-neutral-800"}`}>{Number(i.onHand)} {i.unit}{isLow(i) ? " ⚠" : ""}</td>
                  <td className="px-3 py-2 text-right text-neutral-500">{Number(i.reorderPoint)}</td>
                  <td className="px-3 py-2 text-right text-neutral-500">${Number(i.cost).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {editable && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Add an item</h2>
          <ItemCreateForm />
        </Card>
      )}
    </div>
  );
}
