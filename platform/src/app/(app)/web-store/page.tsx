import Link from "next/link";
import { and, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { db } from "@/db";
import { storeProducts, storeCategories, inventoryItems } from "@/db/schema";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { togglePublishAction } from "@/lib/store/actions";

export const dynamic = "force-dynamic";
const PAGE = 50;

const VIS_LABEL: Record<string, string> = { public: "Public", b2b: "B2B only", both: "Public + B2B" };
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function imgSrc(p: { imageBase64: string | null; imageMimeType: string | null }, inv: { imageBase64: string | null; imageMimeType: string | null } | null): string | null {
  if (p.imageBase64) return `data:${p.imageMimeType ?? "image/png"};base64,${p.imageBase64}`;
  if (inv?.imageBase64) return `data:${inv.imageMimeType ?? "image/png"};base64,${inv.imageBase64}`;
  return null;
}

export default async function WebStorePage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const user = await requireModule("web_store");
  const editable = canEdit(user.roles, "web_store");
  const sp = await searchParams;
  const q = sp.q?.trim();
  const page = Math.max(1, Number(sp.page) || 1);

  const cond: SQL[] = [];
  if (q) cond.push(or(ilike(storeProducts.title, `%${q}%`), ilike(inventoryItems.sku, `%${q}%`)) as SQL);
  const where = cond.length ? and(...cond) : undefined;

  const [rows, [{ total }], [{ pub }], [{ cats }]] = await Promise.all([
    db.select({
      id: storeProducts.id, title: storeProducts.title, retailPrice: storeProducts.retailPrice, b2bPrice: storeProducts.b2bPrice,
      visibility: storeProducts.visibility, published: storeProducts.published, featured: storeProducts.featured,
      imageBase64: storeProducts.imageBase64, imageMimeType: storeProducts.imageMimeType,
      category: storeCategories.name, sku: inventoryItems.sku, onHand: inventoryItems.onHand,
      invImg: inventoryItems.imageBase64, invMime: inventoryItems.imageMimeType,
    }).from(storeProducts)
      .leftJoin(storeCategories, eq(storeProducts.categoryId, storeCategories.id))
      .leftJoin(inventoryItems, eq(storeProducts.inventoryItemId, inventoryItems.id))
      .where(where).orderBy(desc(storeProducts.createdAt)).limit(PAGE).offset((page - 1) * PAGE),
    db.select({ total: count() }).from(storeProducts),
    db.select({ pub: count() }).from(storeProducts).where(eq(storeProducts.published, true)),
    db.select({ cats: count() }).from(storeCategories),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title="Web Store"
        description="Publish products to the storefront, set retail and B2B pricing, and control who can see them."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/web-store/orders" className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Orders</Link>
            <Link href="/web-store/customers" className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Customers</Link>
            <a href="/shop" target="_blank" rel="noreferrer" className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">View store ↗</a>
            {editable && <Link href="/web-store/inventory" className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Add from inventory</Link>}
            {editable && <Link href="/web-store/categories" className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Categories</Link>}
            {editable && <Link href="/web-store/settings" className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Settings</Link>}
            {editable && <Link href="/web-store/products/new" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">+ New product</Link>}
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Products" value={total.toLocaleString()} hint="In the store catalog" />
        <StatCard label="Published" value={pub.toLocaleString()} hint="Live on the storefront" />
        <StatCard label="Categories" value={cats.toLocaleString()} hint="Merchandising groups" />
      </div>

      <Card>
        <form className="flex flex-wrap items-center gap-2 text-sm">
          <input name="q" defaultValue={q ?? ""} placeholder="Search products or SKU…" className="min-w-64 flex-1 rounded-md border border-neutral-300 bg-white px-2 py-1.5 outline-none focus:border-brand" />
          <button className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 font-medium text-neutral-700 hover:bg-neutral-50">Search</button>
          <span className="ml-auto text-xs text-neutral-400">{total.toLocaleString()} products</span>
        </form>
      </Card>

      <Card className="p-0">
        {/* Desktop */}
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-neutral-400"><tr><th className="px-4 py-2">Product</th><th className="px-4 py-2">SKU</th><th className="px-4 py-2">Category</th><th className="px-4 py-2 text-right">Retail</th><th className="px-4 py-2 text-right">B2B</th><th className="px-4 py-2">Visibility</th><th className="px-4 py-2">Status</th></tr></thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-neutral-400">No products yet. Add from inventory to get started.</td></tr>}
              {rows.map((p) => {
                const src = imgSrc(p, { imageBase64: p.invImg, imageMimeType: p.invMime });
                return (
                  <tr key={p.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-2">
                      <Link href={`/web-store/products/${p.id}`} className="flex items-center gap-2 font-medium text-brand-ink hover:underline">
                        {src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={src} alt="" className="h-8 w-8 rounded border border-neutral-200 object-cover" />
                        ) : <span className="flex h-8 w-8 items-center justify-center rounded border border-dashed border-neutral-200 text-[9px] text-neutral-300">—</span>}
                        <span>{p.title}{p.featured ? <span className="ml-1 rounded bg-amber-50 px-1 text-[9px] text-amber-700">★</span> : null}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-neutral-500">{p.sku ?? "—"}</td>
                    <td className="px-4 py-2 text-neutral-600">{p.category ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-neutral-800">{money(Number(p.retailPrice))}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-neutral-500">{p.b2bPrice ? money(Number(p.b2bPrice)) : "—"}</td>
                    <td className="px-4 py-2 text-xs text-neutral-500">{VIS_LABEL[p.visibility]}</td>
                    <td className="px-4 py-2">
                      {editable ? (
                        <form action={togglePublishAction}>
                          <input type="hidden" name="id" value={p.id} />
                          <button className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.published ? "bg-emerald-100 text-emerald-700" : "bg-neutral-200 text-neutral-600"}`}>{p.published ? "Published" : "Draft"}</button>
                        </form>
                      ) : <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.published ? "bg-emerald-100 text-emerald-700" : "bg-neutral-200 text-neutral-600"}`}>{p.published ? "Published" : "Draft"}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Mobile */}
        <ul className="divide-y divide-neutral-100 lg:hidden">
          {rows.length === 0 && <li className="px-4 py-6 text-center text-sm text-neutral-400">No products yet.</li>}
          {rows.map((p) => (
            <li key={p.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <Link href={`/web-store/products/${p.id}`} className="font-medium text-brand-ink">{p.title}</Link>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${p.published ? "bg-emerald-100 text-emerald-700" : "bg-neutral-200 text-neutral-600"}`}>{p.published ? "Published" : "Draft"}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-neutral-500">
                <span className="font-mono">{p.sku ?? "—"}</span>
                <span>{money(Number(p.retailPrice))}</span>
                <span>{VIS_LABEL[p.visibility]}</span>
              </div>
            </li>
          ))}
        </ul>
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-neutral-400">Page {page} of {pages}</span>
            <div className="flex gap-2">
              {page > 1 && <Link href={`/web-store?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page - 1) })}`} className="rounded-md border border-neutral-300 bg-white px-3 py-1 font-medium text-neutral-700 hover:bg-neutral-50">← Prev</Link>}
              {page < pages && <Link href={`/web-store?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page + 1) })}`} className="rounded-md border border-neutral-300 bg-white px-3 py-1 font-medium text-neutral-700 hover:bg-neutral-50">Next →</Link>}
            </div>
          </div>
        )}
      </Card>

      <p className="text-xs text-neutral-400">The public storefront sells in-stock inventory only (no custom orders); the B2B portal (Business Partner login) will show B2B pricing and the full catalog. Storefront + customer logins are the next phase.</p>
    </div>
  );
}
