import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { decorationMethods, printLocations, colorTiers, embroideryTiers, sizeClasses } from "@/db/schema";
import { Card } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import {
  saveMethodAction, createMethodAction,
  addLocationAction, deleteLocationAction,
  addColorTierAction, deleteColorTierAction,
  saveEmbTierAction, deleteEmbTierAction,
  saveSizeClassAction, deleteSizeClassAction,
} from "@/lib/catalog/actions";
import type { DecorationPricing, SizeEntry } from "@/lib/sales/pricing";

export const dynamic = "force-dynamic";

const inp = "w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand";
const sinp = "w-20 rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm outline-none focus:border-brand";
const lbl = "text-[11px] font-medium text-neutral-500";

export default async function PricingSettingsPage() {
  const [methods, locations, tiers, emb, classes] = await Promise.all([
    db.select().from(decorationMethods).orderBy(asc(decorationMethods.sortOrder)),
    db.select().from(printLocations).orderBy(asc(printLocations.sortOrder)),
    db.select().from(colorTiers).orderBy(asc(colorTiers.sortOrder)),
    db.select().from(embroideryTiers).orderBy(asc(embroideryTiers.sortOrder)),
    db.select().from(sizeClasses).orderBy(asc(sizeClasses.sortOrder)),
  ]);

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/admin/catalog" className="text-sm text-neutral-500 hover:text-neutral-900">← Catalog</Link>

      {/* Decoration methods */}
      <Card className="overflow-x-auto">
        <h2 className="mb-1 text-sm font-semibold text-neutral-900">Decoration methods</h2>
        <p className="mb-3 text-xs text-neutral-500">Setup = one-time per color; run = per garment per color; dark = underbase per garment on dark tiers. Embroidery uses stitch tiers below.</p>
        <table className="w-full min-w-[820px] text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-neutral-400">
              <th className="py-1">Method</th><th className="py-1">Mode</th><th className="py-1">Setup/color (new)</th><th className="py-1">Setup/color (reorder)</th><th className="py-1">Flat setup</th><th className="py-1">Run/color/unit</th><th className="py-1">Dark/unit</th><th className="py-1">Active</th><th />
            </tr>
          </thead>
          <tbody>
            {methods.map((m) => {
              const p = (m.pricing ?? {}) as DecorationPricing;
              return (
                <tr key={m.id} className="border-t border-neutral-100">
                  <td className="py-1.5 pr-2">
                    <form action={saveMethodAction} id={`m-${m.id}`} className="contents" />
                    <input form={`m-${m.id}`} type="hidden" name="id" value={m.id} />
                    <input form={`m-${m.id}`} name="name" defaultValue={m.name} className={`${inp} w-32`} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <select form={`m-${m.id}`} name="priceMode" defaultValue={m.priceMode} className={`${inp} w-24`}>
                      <option value="per_color">per_color</option>
                      <option value="stitch">stitch</option>
                    </select>
                  </td>
                  <td className="py-1.5 pr-2"><input form={`m-${m.id}`} name="setupPerColorNew" type="number" step="0.01" defaultValue={p.setupPerColorNew ?? 0} className={sinp} /></td>
                  <td className="py-1.5 pr-2"><input form={`m-${m.id}`} name="setupPerColorReorder" type="number" step="0.01" defaultValue={p.setupPerColorReorder ?? 0} className={sinp} /></td>
                  <td className="py-1.5 pr-2"><input form={`m-${m.id}`} name="flatSetup" type="number" step="0.01" defaultValue={p.flatSetup ?? 0} className={sinp} /></td>
                  <td className="py-1.5 pr-2"><input form={`m-${m.id}`} name="runPerColorPerUnit" type="number" step="0.01" defaultValue={p.runPerColorPerUnit ?? 0} className={sinp} /></td>
                  <td className="py-1.5 pr-2"><input form={`m-${m.id}`} name="darkUpchargePerUnit" type="number" step="0.01" defaultValue={p.darkUpchargePerUnit ?? 0} className={sinp} /></td>
                  <td className="py-1.5 pr-2"><input form={`m-${m.id}`} type="checkbox" name="active" defaultChecked={m.active} className="h-4 w-4" /></td>
                  <td className="py-1.5"><button form={`m-${m.id}`} className="rounded-md bg-neutral-900 px-2 py-1 text-xs font-semibold text-white hover:bg-neutral-700">Save</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <form action={createMethodAction} className="mt-3 flex items-end gap-2 border-t border-neutral-100 pt-3">
          <label><span className={lbl}>New method</span><input name="name" placeholder="Sublimation" className={`mt-1 ${inp} w-40`} /></label>
          <label><span className={lbl}>Mode</span>
            <select name="priceMode" className={`mt-1 ${inp} w-28`}><option value="per_color">per_color</option><option value="stitch">stitch</option></select>
          </label>
          <button className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">+ Add</button>
        </form>
      </Card>

      {/* Print locations */}
      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Print locations ({locations.length})</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          {locations.map((l) => (
            <span key={l.id} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs text-neutral-700">
              {l.name}
              <form action={deleteLocationAction}><input type="hidden" name="id" value={l.id} /><ConfirmButton message={`Remove ${l.name}?`} className="text-red-500 hover:text-red-700">×</ConfirmButton></form>
            </span>
          ))}
        </div>
        <form action={addLocationAction} className="flex items-end gap-2">
          <label><span className={lbl}>Add location</span><input name="name" placeholder="Left Sleeve" className={`mt-1 ${inp} w-48`} /></label>
          <button className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">+ Add</button>
        </form>
      </Card>

      {/* Color tiers */}
      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Color tiers</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          {tiers.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs text-neutral-700">
              {t.name}
              <form action={deleteColorTierAction}><input type="hidden" name="id" value={t.id} /><ConfirmButton message={`Remove ${t.name}?`} className="text-red-500 hover:text-red-700">×</ConfirmButton></form>
            </span>
          ))}
        </div>
        <form action={addColorTierAction} className="flex items-end gap-2">
          <label><span className={lbl}>Add tier</span><input name="name" placeholder="Neon" className={`mt-1 ${inp} w-40`} /></label>
          <button className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">+ Add</button>
        </form>
      </Card>

      {/* Embroidery tiers */}
      <Card className="overflow-x-auto">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Embroidery tiers</h2>
        <table className="w-full min-w-[520px] text-xs">
          <thead><tr className="text-left text-[10px] uppercase tracking-wide text-neutral-400"><th className="py-1">Code</th><th className="py-1">Name</th><th className="py-1">Max stitches</th><th className="py-1">Price/unit</th><th /></tr></thead>
          <tbody>
            {emb.map((e) => (
              <tr key={e.id} className="border-t border-neutral-100">
                <td className="py-1.5 pr-2 font-mono text-neutral-500">{e.code}</td>
                <td className="py-1.5 pr-2">
                  <form action={saveEmbTierAction} id={`e-${e.id}`} className="contents" /><input form={`e-${e.id}`} type="hidden" name="id" value={e.id} />
                  <input form={`e-${e.id}`} name="name" defaultValue={e.name} className={`${inp} w-40`} />
                </td>
                <td className="py-1.5 pr-2"><input form={`e-${e.id}`} name="maxStitches" type="number" defaultValue={e.maxStitches} className={sinp} /></td>
                <td className="py-1.5 pr-2"><input form={`e-${e.id}`} name="pricePerUnit" type="number" step="0.01" defaultValue={e.pricePerUnit} className={sinp} /></td>
                <td className="py-1.5"><button form={`e-${e.id}`} className="rounded-md bg-neutral-900 px-2 py-1 text-xs font-semibold text-white hover:bg-neutral-700">Save</button> <form action={deleteEmbTierAction} className="inline"><input type="hidden" name="id" value={e.id} /><ConfirmButton message="Remove tier?" className="ml-1 text-xs text-red-600 hover:text-red-800">×</ConfirmButton></form></td>
              </tr>
            ))}
          </tbody>
        </table>
        <form action={saveEmbTierAction} className="mt-3 flex items-end gap-2 border-t border-neutral-100 pt-3">
          <label><span className={lbl}>Code</span><input name="code" placeholder="D" className={`mt-1 ${inp} w-16`} /></label>
          <label><span className={lbl}>Name</span><input name="name" placeholder="Tier D (≤20k)" className={`mt-1 ${inp} w-40`} /></label>
          <label><span className={lbl}>Max stitches</span><input name="maxStitches" type="number" placeholder="20000" className={`mt-1 ${sinp}`} /></label>
          <label><span className={lbl}>Price/unit</span><input name="pricePerUnit" type="number" step="0.01" placeholder="13.00" className={`mt-1 ${sinp}`} /></label>
          <button className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">+ Add</button>
        </form>
      </Card>

      {/* Size classes */}
      <Card>
        <h2 className="mb-1 text-sm font-semibold text-neutral-900">Size classes</h2>
        <p className="mb-3 text-xs text-neutral-500">Sizes as a comma list; add <code>:upcharge</code> for a size premium — e.g. <code>S,M,L,XL,2XL:2,3XL:3</code>.</p>
        <div className="space-y-2">
          {classes.map((c) => {
            const sizes = (c.sizes ?? []) as SizeEntry[];
            const sizeStr = sizes.map((s) => (s.upcharge ? `${s.size}:${s.upcharge}` : s.size)).join(",");
            return (
              <form key={c.id} action={saveSizeClassAction} className="flex items-end gap-2">
                <input type="hidden" name="id" value={c.id} />
                <label className="w-32"><span className={lbl}>{c.code}</span><input name="name" defaultValue={c.name} className={`mt-1 ${inp}`} /></label>
                <label className="flex-1"><span className={lbl}>Sizes</span><input name="sizes" defaultValue={sizeStr} className={`mt-1 ${inp}`} /></label>
                <button className="rounded-md bg-neutral-900 px-2 py-1.5 text-xs font-semibold text-white hover:bg-neutral-700">Save</button>
                <ConfirmButton message={`Delete size class ${c.name}?`} className="text-xs text-red-600 hover:text-red-800" formAction={deleteSizeClassAction}>×</ConfirmButton>
              </form>
            );
          })}
        </div>
        <form action={saveSizeClassAction} className="mt-3 flex items-end gap-2 border-t border-neutral-100 pt-3">
          <label className="w-24"><span className={lbl}>Code</span><input name="code" placeholder="infant" className={`mt-1 ${inp}`} /></label>
          <label className="w-32"><span className={lbl}>Name</span><input name="name" placeholder="Infant" className={`mt-1 ${inp}`} /></label>
          <label className="flex-1"><span className={lbl}>Sizes</span><input name="sizes" placeholder="6M,12M,18M,24M" className={`mt-1 ${inp}`} /></label>
          <button className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">+ Add</button>
        </form>
      </Card>
    </div>
  );
}
