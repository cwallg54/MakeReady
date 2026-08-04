import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { catalogStyles, sizeClasses } from "@/db/schema";
import { Card } from "@/components/ui";
import { createStyleAction } from "@/lib/catalog/actions";

export const dynamic = "force-dynamic";

const inp = "w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand";
const lbl = "text-xs font-medium text-neutral-500";
const money = (n: number) => `$${n.toFixed(2)}`;

export default async function CatalogPage() {
  const [styles, classes] = await Promise.all([
    db.select().from(catalogStyles).orderBy(asc(catalogStyles.sortOrder), asc(catalogStyles.name)),
    db.select().from(sizeClasses).orderBy(asc(sizeClasses.sortOrder)),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">Blank garments reps pick from in the Quote Builder.</p>
        <Link href="/admin/catalog/pricing" className="text-sm font-medium text-brand-ink hover:text-brand-ink-dark">Decoration &amp; pricing settings →</Link>
      </div>

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-neutral-900">New garment style</h2>
        <form action={createStyleAction} className="grid gap-3 sm:grid-cols-3">
          <label className="sm:col-span-1"><span className={lbl}>Brand</span><input name="brand" placeholder="Gildan" className={`mt-1 ${inp}`} /></label>
          <label className="sm:col-span-1"><span className={lbl}>Style #</span><input name="styleNumber" placeholder="5000" className={`mt-1 ${inp}`} /></label>
          <label className="sm:col-span-1"><span className={lbl}>Category</span><input name="category" placeholder="T-Shirt" className={`mt-1 ${inp}`} /></label>
          <label className="sm:col-span-3"><span className={lbl}>Name</span><input name="name" required placeholder="Gildan 5000 Heavy Cotton Tee" className={`mt-1 ${inp}`} /></label>
          <label className="sm:col-span-1"><span className={lbl}>Size class</span>
            <select name="sizeClassCode" className={`mt-1 ${inp}`}>
              <option value="">—</option>
              {classes.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </label>
          <label className="sm:col-span-1"><span className={lbl}>Base sell $</span><input name="basePrice" type="number" step="0.01" min="0" defaultValue="0" className={`mt-1 ${inp}`} /></label>
          <label className="sm:col-span-1"><span className={lbl}>Supplier cost $ (opt.)</span><input name="supplierCost" type="number" step="0.01" min="0" className={`mt-1 ${inp}`} /></label>
          <div className="sm:col-span-3"><button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">Add style</button></div>
        </form>
      </Card>

      <Card className="p-0">
        <div className="border-b border-neutral-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-neutral-900">Styles ({styles.length})</h2>
        </div>
        <ul className="divide-y divide-neutral-100">
          {styles.length === 0 && <li className="px-5 py-6 text-center text-sm text-neutral-400">No styles yet.</li>}
          {styles.map((s) => (
            <li key={s.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <Link href={`/admin/catalog/${s.id}`} className="font-medium text-neutral-900 hover:underline">{s.name}</Link>
                {!s.active && <span className="ml-2 rounded bg-neutral-200 px-1.5 py-0.5 text-xs text-neutral-600">inactive</span>}
                <p className="text-xs text-neutral-500">{[s.brand, s.styleNumber, s.category].filter(Boolean).join(" · ")} · base {money(Number(s.basePrice))} · {s.sizeClassCode ?? "no size class"}</p>
              </div>
              <Link href={`/admin/catalog/${s.id}`} className="text-sm text-neutral-600 hover:text-neutral-900">Edit</Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
