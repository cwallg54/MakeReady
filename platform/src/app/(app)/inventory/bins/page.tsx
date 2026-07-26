import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { warehouses, bins } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { Card, PageHeader } from "@/components/ui";
import { createWarehouseAction, createBinAction } from "@/lib/inventory/bin-actions";

export const dynamic = "force-dynamic";

const input = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-neutral-500";

export default async function BinsPage() {
  const user = await requireModule("inventory");
  const editable = canEdit(user.roles, "inventory");

  const whs = await db.select().from(warehouses).orderBy(asc(warehouses.code));
  const allBins = await db.select().from(bins).orderBy(asc(bins.code));
  const binsByWhs = (id: string) => allBins.filter((b) => b.warehouseId === id);

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/inventory" className="text-sm text-neutral-500 hover:text-neutral-900">← Inventory</Link>
      <PageHeader title="Warehouses & bins" description="Storage locations for stock put-away and picking." />

      {whs.length === 0 && <Card><p className="text-sm text-neutral-500">No warehouses yet.</p></Card>}

      {whs.map((w) => (
        <Card key={w.id}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900">{w.code} · {w.name}{w.isDefault ? " (default)" : ""}{!w.active ? " · inactive" : ""}</h2>
            <span className="text-xs text-neutral-400">{binsByWhs(w.id).length} bins</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {binsByWhs(w.id).length === 0 && <span className="text-xs text-neutral-400">No bins.</span>}
            {binsByWhs(w.id).map((b) => (
              <span key={b.id} className={`rounded border px-2 py-0.5 font-mono text-xs ${b.isReceiving ? "border-blue-300 bg-blue-50 text-blue-700" : "border-neutral-200 bg-neutral-50 text-neutral-700"}`} title={b.description ?? undefined}>
                {b.code}{b.isReceiving ? " ⇤" : ""}
              </span>
            ))}
          </div>
          {editable && (
            <form action={createBinAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-neutral-100 pt-3">
              <input type="hidden" name="warehouseId" value={w.id} />
              <label className="flex flex-col text-xs text-neutral-500">Bin code<input name="code" placeholder="01-A01" className={`mt-1 ${input}`} required /></label>
              <label className="flex flex-col text-xs text-neutral-500">Description<input name="description" placeholder="Aisle A, bay 1" className={`mt-1 ${input}`} /></label>
              <label className="flex items-center gap-1 text-xs text-neutral-600"><input type="checkbox" name="isReceiving" className="h-4 w-4" /> Receiving</label>
              <button className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Add bin</button>
            </form>
          )}
        </Card>
      ))}

      {editable && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Add a warehouse</h2>
          <form action={createWarehouseAction} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col text-xs text-neutral-500">Code<input name="code" placeholder="01" className={`mt-1 ${input}`} required /></label>
            <label className="flex flex-col text-xs text-neutral-500">Name<input name="name" placeholder="Main warehouse" className={`mt-1 ${input}`} required /></label>
            <label className="flex items-center gap-1 text-xs text-neutral-600"><input type="checkbox" name="isDefault" className="h-4 w-4" /> Default</label>
            <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">Add warehouse</button>
          </form>
        </Card>
      )}
    </div>
  );
}
