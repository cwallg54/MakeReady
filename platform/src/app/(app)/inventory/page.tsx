import Link from "next/link";
import { and, asc, count, eq, ilike, isNotNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { inventoryItems } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { Card, PageHeader } from "@/components/ui";
import { ItemCreateForm } from "./item-create-form";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ q?: string; low?: string; territory?: string; page?: string }> }) {
  const user = await requireModule("inventory");
  const editable = canEdit(user.roles, "inventory");
  const { q, low, territory, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  // Filter in SQL (indexed) and page — never pull the whole 6k+ table.
  const conditions: SQL[] = [];
  if (q) conditions.push(or(ilike(inventoryItems.name, `%${q}%`), ilike(inventoryItems.sku, `%${q}%`), ilike(inventoryItems.category, `%${q}%`)) as SQL);
  if (low === "1") conditions.push(sql`${inventoryItems.reorderPoint} > 0 AND ${inventoryItems.onHand} <= ${inventoryItems.reorderPoint}`);
  if (territory) conditions.push(eq(inventoryItems.territory, territory));
  const where = conditions.length ? and(...conditions) : undefined;

  const [items, [{ total }], territoryRows] = await Promise.all([
    db.select().from(inventoryItems).where(where).orderBy(asc(inventoryItems.name)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(inventoryItems).where(where),
    db.selectDistinct({ territory: inventoryItems.territory }).from(inventoryItems).where(isNotNull(inventoryItems.territory)).orderBy(asc(inventoryItems.territory)),
  ]);
  const territories = territoryRows.map((r) => r.territory).filter((t): t is string => !!t);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isLow = (i: (typeof items)[number]) => Number(i.onHand) <= Number(i.reorderPoint) && Number(i.reorderPoint) > 0;
  const qs = (p: number) => { const s = new URLSearchParams(); if (q) s.set("q", q); if (low) s.set("low", low); if (territory) s.set("territory", territory); if (p > 1) s.set("page", String(p)); return `/inventory?${s.toString()}`; };

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title="Inventory"
        description="Item master and stock levels."
        action={<Link href="/inventory/bins" className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">Warehouses &amp; bins</Link>}
      />

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-neutral-900">Item master <span className="font-normal text-neutral-400">({total.toLocaleString()})</span></h2>
          <form className="flex flex-wrap items-center gap-2">
            <input name="q" defaultValue={q ?? ""} placeholder="Search name / SKU / category" className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-neutral-500" />
            {territories.length > 0 && (
              <select name="territory" defaultValue={territory ?? ""} className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-neutral-500">
                <option value="">All territories</option>
                {territories.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
            <label className="flex items-center gap-1 text-xs text-neutral-600"><input type="checkbox" name="low" value="1" defaultChecked={low === "1"} className="h-4 w-4" /> Low stock only</label>
            <button className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Filter</button>
          </form>
        </div>
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-400">
              <tr>
                <th className="px-3 py-2">SKU</th><th className="px-3 py-2">Item</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">Territory</th>
                <th className="px-3 py-2 text-right">On hand</th><th className="px-3 py-2 text-right">Reorder</th><th className="px-3 py-2 text-right">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {items.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-neutral-400">No items{q || low || territory ? " match the filter" : " yet"}.</td></tr>}
              {items.map((i) => (
                <tr key={i.id} className="hover:bg-neutral-50">
                  <td className="px-3 py-2 font-mono text-xs text-neutral-500">{i.sku}</td>
                  <td className="px-3 py-2"><Link href={`/inventory/${i.id}`} className="font-medium text-neutral-900 hover:underline">{i.name}</Link>{!i.active && <span className="ml-2 text-[10px] text-neutral-400">(inactive)</span>}</td>
                  <td className="px-3 py-2 text-neutral-500">{i.category ?? "—"}</td>
                  <td className="px-3 py-2 text-neutral-500">{i.territory ?? "—"}</td>
                  <td className={`px-3 py-2 text-right font-medium ${isLow(i) ? "text-amber-600" : "text-neutral-800"}`}>{Number(i.onHand)} {i.unit}{isLow(i) ? " ⚠" : ""}</td>
                  <td className="px-3 py-2 text-right text-neutral-500">{Number(i.reorderPoint)}</td>
                  <td className="px-3 py-2 text-right text-neutral-500">${Number(i.cost).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <ul className="divide-y divide-neutral-100 lg:hidden">
          {items.length === 0 && <li className="py-6 text-center text-sm text-neutral-400">No items{q || low ? " match the filter" : " yet"}.</li>}
          {items.map((i) => (
            <li key={i.id}>
              <Link href={`/inventory/${i.id}`} className="flex items-center gap-3 py-3 active:bg-neutral-50">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-neutral-900">{i.name}{!i.active && <span className="ml-1 text-[10px] text-neutral-400">(inactive)</span>}</p>
                  <p className="mt-0.5 truncate text-xs text-neutral-500"><span className="font-mono">{i.sku}</span>{i.category ? ` · ${i.category}` : ""}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-sm font-semibold ${isLow(i) ? "text-amber-600" : "text-neutral-800"}`}>{Number(i.onHand)} {i.unit}{isLow(i) ? " ⚠" : ""}</p>
                  <p className="text-xs text-neutral-400">${Number(i.cost).toFixed(2)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
        {pages > 1 && (
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-neutral-400">Page {page} of {pages}</span>
            <div className="flex gap-2">
              {page > 1 && <Link href={qs(page - 1)} className="rounded-md border border-neutral-300 bg-white px-3 py-1 font-medium text-neutral-700 hover:bg-neutral-50">← Prev</Link>}
              {page < pages && <Link href={qs(page + 1)} className="rounded-md border border-neutral-300 bg-white px-3 py-1 font-medium text-neutral-700 hover:bg-neutral-50">Next →</Link>}
            </div>
          </div>
        )}
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
