import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { catalogStyles, catalogColors, sizeClasses, colorTiers } from "@/db/schema";
import { Card } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { updateStyleAction, deleteStyleAction, addColorAction, deleteColorAction } from "@/lib/catalog/actions";

export const dynamic = "force-dynamic";

const inp = "w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand";
const lbl = "text-xs font-medium text-neutral-500";

export default async function StyleEditPage({ params }: { params: Promise<{ styleId: string }> }) {
  const { styleId } = await params;
  const style = await db.query.catalogStyles.findFirst({ where: eq(catalogStyles.id, styleId) });
  if (!style) notFound();
  const [colors, classes, tiers] = await Promise.all([
    db.select().from(catalogColors).where(eq(catalogColors.styleId, styleId)).orderBy(asc(catalogColors.sortOrder), asc(catalogColors.name)),
    db.select().from(sizeClasses).orderBy(asc(sizeClasses.sortOrder)),
    db.select().from(colorTiers).orderBy(asc(colorTiers.sortOrder)),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/admin/catalog" className="text-sm text-neutral-500 hover:text-neutral-900">← Catalog</Link>

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-neutral-900">Edit style</h2>
        <form action={updateStyleAction} className="grid gap-3 sm:grid-cols-3">
          <input type="hidden" name="id" value={style.id} />
          <label><span className={lbl}>Brand</span><input name="brand" defaultValue={style.brand ?? ""} className={`mt-1 ${inp}`} /></label>
          <label><span className={lbl}>Style #</span><input name="styleNumber" defaultValue={style.styleNumber ?? ""} className={`mt-1 ${inp}`} /></label>
          <label><span className={lbl}>Category</span><input name="category" defaultValue={style.category ?? ""} className={`mt-1 ${inp}`} /></label>
          <label className="sm:col-span-3"><span className={lbl}>Name</span><input name="name" defaultValue={style.name} className={`mt-1 ${inp}`} /></label>
          <label><span className={lbl}>Size class</span>
            <select name="sizeClassCode" defaultValue={style.sizeClassCode ?? ""} className={`mt-1 ${inp}`}>
              <option value="">—</option>
              {classes.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </label>
          <label><span className={lbl}>Base sell $</span><input name="basePrice" type="number" step="0.01" min="0" defaultValue={style.basePrice} className={`mt-1 ${inp}`} /></label>
          <label><span className={lbl}>Supplier cost $</span><input name="supplierCost" type="number" step="0.01" min="0" defaultValue={style.supplierCost ?? ""} className={`mt-1 ${inp}`} /></label>
          <label className="flex items-center gap-2 text-sm text-neutral-700 sm:col-span-3"><input type="checkbox" name="active" defaultChecked={style.active} className="h-4 w-4" /> Active</label>
          <div className="flex items-center justify-between sm:col-span-3">
            <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">Save</button>
          </div>
        </form>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Colors ({colors.length})</h2>
        <div className="mb-4 space-y-1">
          {colors.length === 0 && <p className="text-sm text-neutral-400">No colors yet.</p>}
          {colors.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-md border border-neutral-100 px-3 py-1.5 text-sm">
              <span className="flex items-center gap-2">
                {c.hex && <span className="inline-block h-4 w-4 rounded-full border border-neutral-300" style={{ backgroundColor: c.hex }} />}
                <span className="text-neutral-900">{c.name}</span>
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500">{c.tierCode ?? "no tier"}</span>
              </span>
              <form action={deleteColorAction}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="styleId" value={style.id} />
                <ConfirmButton message="Remove this color?" className="text-xs text-red-600 hover:text-red-800">Remove</ConfirmButton>
              </form>
            </div>
          ))}
        </div>
        <form action={addColorAction} className="grid gap-2 sm:grid-cols-4">
          <input type="hidden" name="styleId" value={style.id} />
          <label className="sm:col-span-2"><span className={lbl}>Color name</span><input name="name" required placeholder="Navy" className={`mt-1 ${inp}`} /></label>
          <label><span className={lbl}>Tier</span>
            <select name="tierCode" className={`mt-1 ${inp}`}>
              <option value="">—</option>
              {tiers.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
            </select>
          </label>
          <label><span className={lbl}>Swatch hex</span><input name="hex" placeholder="#1e293b" className={`mt-1 ${inp}`} /></label>
          <div className="sm:col-span-4"><button className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">+ Add color</button></div>
        </form>
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-red-700">Danger zone</h2>
        <form action={deleteStyleAction}>
          <input type="hidden" name="id" value={style.id} />
          <ConfirmButton message="Delete this style and its colors? Quote lines that used it keep their saved snapshot." className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50">Delete style</ConfirmButton>
        </form>
      </Card>
    </div>
  );
}
