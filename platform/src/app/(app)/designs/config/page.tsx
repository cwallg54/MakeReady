import Link from "next/link";
import { asc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { isAdmin } from "@/lib/rbac";
import { db } from "@/db";
import { designBrands, designSuffixes } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { addSuffixAction, toggleSuffixAction } from "@/lib/designs/actions";

export const dynamic = "force-dynamic";
const inp = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-neutral-500";

export default async function DesignConfigPage() {
  const user = await requireUser();
  if (!isAdmin(user.roles)) redirect("/403");
  const [brands, suffixes] = await Promise.all([
    db.select().from(designBrands).orderBy(asc(designBrands.sortOrder)),
    db.select().from(designSuffixes).orderBy(asc(designSuffixes.kind), asc(designSuffixes.sortOrder)),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/designs" className="text-sm text-neutral-500 hover:text-neutral-900">← Design Library</Link>
      <PageHeader title="Design settings" description="Brands and the product/location suffixes art picks from." />

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Brands</h2>
        <div className="flex flex-wrap gap-2">
          {brands.map((b) => (
            <span key={b.id} className={`rounded-full border px-3 py-1 text-sm ${b.isLegacy ? "border-amber-300 bg-amber-50 text-amber-800" : "border-neutral-200 bg-neutral-50 text-neutral-700"}`}>{b.code} · {b.name}{b.isLegacy ? " (legacy — exception)" : ""}</span>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Suffixes</h2>
        <div className="mb-4 space-y-1">
          {suffixes.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-md border border-neutral-100 px-3 py-1.5 text-sm">
              <span className={s.active ? "text-neutral-800" : "text-neutral-400 line-through"}><span className="font-mono">{s.code}</span> · {s.label} <span className="text-xs text-neutral-400">({s.kind})</span></span>
              <form action={toggleSuffixAction}><input type="hidden" name="id" value={s.id} /><ConfirmButton message={s.active ? "Deactivate this suffix?" : "Reactivate this suffix?"} className="text-xs text-neutral-500 hover:text-neutral-800">{s.active ? "Deactivate" : "Activate"}</ConfirmButton></form>
            </div>
          ))}
        </div>
        <form action={addSuffixAction} className="flex flex-wrap items-end gap-2 border-t border-neutral-100 pt-3">
          <label className="text-xs text-neutral-500">Code<input name="code" placeholder="KC" className={`mt-1 w-20 ${inp}`} /></label>
          <label className="text-xs text-neutral-500">Label<input name="label" placeholder="Key Chain" className={`mt-1 w-40 ${inp}`} /></label>
          <label className="text-xs text-neutral-500">Kind<select name="kind" className={`mt-1 ${inp}`}><option value="product">product</option><option value="location">location</option><option value="hardgood">hardgood</option></select></label>
          <button className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">+ Add</button>
        </form>
      </Card>
    </div>
  );
}
