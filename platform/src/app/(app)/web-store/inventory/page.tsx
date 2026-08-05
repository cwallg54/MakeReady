import Link from "next/link";
import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { db } from "@/db";
import { inventoryItems, storeProducts } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { addFromInventoryAction } from "@/lib/store/actions";

export const dynamic = "force-dynamic";
const PAGE = 40;

export default async function StoreInventoryPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const user = await requireModule("web_store");
  if (!canEdit(user.roles, "web_store")) redirect("/web-store");
  const sp = await searchParams;
  const q = sp.q?.trim();
  const page = Math.max(1, Number(sp.page) || 1);

  const cond: SQL[] = [eq(inventoryItems.active, true)];
  if (q) cond.push(or(ilike(inventoryItems.name, `%${q}%`), ilike(inventoryItems.sku, `%${q}%`)) as SQL);
  const where = and(...cond);

  const [rows, [{ total }]] = await Promise.all([
    db.select({
      id: inventoryItems.id, sku: inventoryItems.sku, name: inventoryItems.name, category: inventoryItems.category,
      onHand: inventoryItems.onHand, image: inventoryItems.imageBase64, mime: inventoryItems.imageMimeType,
      storeId: storeProducts.id,
    }).from(inventoryItems)
      .leftJoin(storeProducts, eq(storeProducts.inventoryItemId, inventoryItems.id))
      .where(where).orderBy(desc(inventoryItems.updatedAt)).limit(PAGE).offset((page - 1) * PAGE),
    db.select({ total: count() }).from(inventoryItems).where(where),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (p: number) => `/web-store/inventory?${new URLSearchParams({ ...(q ? { q } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <div className="max-w-5xl space-y-6">
      <Link href="/web-store" className="text-sm text-neutral-500 hover:text-neutral-900">← Web Store</Link>
      <PageHeader title="Add products from inventory" description="Pick stock items to sell in the store. You'll set the retail price and details next." />

      <Card>
        <form className="flex flex-wrap items-center gap-2 text-sm">
          <input name="q" defaultValue={q ?? ""} placeholder="Search inventory name or SKU…" className="min-w-64 flex-1 rounded-md border border-neutral-300 bg-white px-2 py-1.5 outline-none focus:border-brand" />
          <button className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 font-medium text-neutral-700 hover:bg-neutral-50">Search</button>
          <span className="ml-auto text-xs text-neutral-400">{total.toLocaleString()} items</span>
        </form>
      </Card>

      <Card className="p-0">
        <ul className="divide-y divide-neutral-100">
          {rows.length === 0 && <li className="px-4 py-6 text-center text-sm text-neutral-400">No inventory matches.</li>}
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3">
              {r.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`data:${r.mime ?? "image/png"};base64,${r.image}`} alt="" className="h-10 w-10 shrink-0 rounded border border-neutral-200 object-cover" />
              ) : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-dashed border-neutral-200 text-[9px] text-neutral-300">no img</span>}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-neutral-900">{r.name}</p>
                <p className="truncate text-xs text-neutral-500"><span className="font-mono">{r.sku}</span>{r.category ? ` · ${r.category}` : ""} · {Number(r.onHand)} on hand</p>
              </div>
              {r.storeId ? (
                <Link href={`/web-store/products/${r.storeId}`} className="shrink-0 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50">In store — edit</Link>
              ) : (
                <form action={addFromInventoryAction}>
                  <input type="hidden" name="inventoryItemId" value={r.id} />
                  <button className="shrink-0 rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-700">Add to store →</button>
                </form>
              )}
            </li>
          ))}
        </ul>
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-neutral-400">Page {page} of {pages.toLocaleString()}</span>
            <div className="flex gap-2">
              {page > 1 && <Link href={qs(page - 1)} className="rounded-md border border-neutral-300 bg-white px-3 py-1 font-medium text-neutral-700 hover:bg-neutral-50">← Prev</Link>}
              {page < pages && <Link href={qs(page + 1)} className="rounded-md border border-neutral-300 bg-white px-3 py-1 font-medium text-neutral-700 hover:bg-neutral-50">Next →</Link>}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
