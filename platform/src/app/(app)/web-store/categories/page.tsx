import Link from "next/link";
import { asc, count, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { db } from "@/db";
import { storeCategories, storeProducts } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { addCategoryAction, toggleCategoryAction } from "@/lib/store/actions";

export const dynamic = "force-dynamic";
const inp = "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand";

export default async function StoreCategoriesPage() {
  const user = await requireModule("web_store");
  if (!canEdit(user.roles, "web_store")) redirect("/web-store");

  const cats = await db
    .select({ id: storeCategories.id, name: storeCategories.name, slug: storeCategories.slug, active: storeCategories.active, n: sql<number>`count(${storeProducts.id})::int` })
    .from(storeCategories)
    .leftJoin(storeProducts, eq(storeProducts.categoryId, storeCategories.id))
    .groupBy(storeCategories.id)
    .orderBy(asc(storeCategories.sortOrder), asc(storeCategories.name));

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/web-store" className="text-sm text-neutral-500 hover:text-neutral-900">← Web Store</Link>
      <PageHeader title="Store categories" description="Merchandising groups shown on the storefront." />

      <Card>
        <form action={addCategoryAction} className="flex flex-wrap items-end gap-2">
          <label className="flex-1"><span className="mb-1 block text-xs font-medium text-neutral-600">New category</span><input name="name" required placeholder="e.g. Apparel, Drinkware, Headwear" className={`w-full ${inp}`} /></label>
          <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Add</button>
        </form>
      </Card>

      <Card className="p-0">
        <ul className="divide-y divide-neutral-100">
          {cats.length === 0 && <li className="px-4 py-6 text-center text-sm text-neutral-400">No categories yet.</li>}
          {cats.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <span className={`text-sm font-medium ${c.active ? "text-neutral-900" : "text-neutral-400 line-through"}`}>{c.name}</span>
                <span className="ml-2 text-xs text-neutral-400">{c.n} product{c.n === 1 ? "" : "s"} · <span className="font-mono">{c.slug}</span></span>
              </div>
              <form action={toggleCategoryAction}>
                <input type="hidden" name="id" value={c.id} />
                <button className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50">{c.active ? "Deactivate" : "Activate"}</button>
              </form>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
