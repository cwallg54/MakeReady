import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { db } from "@/db";
import { storeProducts, storeProductVariants, storeCategories, inventoryItems } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { updateStoreProductAction, deleteStoreProductAction, addVariantAction, toggleVariantAction, deleteVariantAction } from "@/lib/store/actions";

export const dynamic = "force-dynamic";
const inp = "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand";
const lbl = "mb-1 block text-xs font-medium text-neutral-600";

export default async function EditStoreProductPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireModule("web_store");
  const editable = canEdit(user.roles, "web_store");
  const { id } = await params;
  const product = await db.query.storeProducts.findFirst({ where: eq(storeProducts.id, id) });
  if (!product) notFound();
  const [cats, inv, variants] = await Promise.all([
    db.select({ id: storeCategories.id, name: storeCategories.name }).from(storeCategories).where(eq(storeCategories.active, true)).orderBy(asc(storeCategories.sortOrder), asc(storeCategories.name)),
    product.inventoryItemId ? db.query.inventoryItems.findFirst({ where: eq(inventoryItems.id, product.inventoryItemId) }) : Promise.resolve(null),
    db.select().from(storeProductVariants).where(eq(storeProductVariants.productId, id)).orderBy(asc(storeProductVariants.sortOrder), asc(storeProductVariants.label)),
  ]);
  const src = product.imageBase64 ? `data:${product.imageMimeType ?? "image/png"};base64,${product.imageBase64}`
    : inv?.imageBase64 ? `data:${inv.imageMimeType ?? "image/png"};base64,${inv.imageBase64}` : null;

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/web-store" className="text-sm text-neutral-500 hover:text-neutral-900">← Web Store</Link>
      <PageHeader
        title={product.title}
        description={inv ? `Backed by inventory ${inv.sku} · ${Number(inv.onHand)} on hand` : "Standalone product"}
        action={<span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${product.published ? "bg-emerald-100 text-emerald-700" : "bg-neutral-200 text-neutral-600"}`}>{product.published ? "Published" : "Draft"}</span>}
      />

      <form action={updateStoreProductAction} className="space-y-5" encType="multipart/form-data">
        <input type="hidden" name="id" value={product.id} />

        <div className="grid gap-6 sm:grid-cols-3">
          <Card className="sm:col-span-1">
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={product.title} className="mx-auto max-h-48 w-auto rounded-md border border-neutral-200 object-contain" />
            ) : <div className="flex h-36 items-center justify-center rounded-md border border-dashed border-neutral-200 text-sm text-neutral-400">No image</div>}
            {editable && (
              <label className="mt-3 block">
                <span className={lbl}>Replace image {inv && <span className="text-neutral-400">(else uses the inventory photo)</span>}</span>
                <input name="image" type="file" accept="image/*" className="block w-full text-xs text-neutral-600 file:mr-2 file:rounded file:border-0 file:bg-neutral-900 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-white" />
              </label>
            )}
          </Card>

          <Card className="space-y-4 sm:col-span-2">
            <label className="block"><span className={lbl}>Title</span><input name="title" defaultValue={product.title} className={inp} readOnly={!editable} /></label>
            <label className="block"><span className={lbl}>URL slug</span><input name="slug" defaultValue={product.slug} className={`${inp} font-mono`} readOnly={!editable} /></label>
            <label className="block"><span className={lbl}>Description</span><textarea name="description" rows={4} defaultValue={product.description ?? ""} className={inp} readOnly={!editable} /></label>
            <label className="block">
              <span className={lbl}>Category</span>
              <select name="categoryId" defaultValue={product.categoryId ?? ""} className={inp} disabled={!editable}>
                <option value="">— none —</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          </Card>
        </div>

        <Card className="grid gap-4 sm:grid-cols-3">
          <label><span className={lbl}>Retail price ($)</span><input name="retailPrice" type="number" step="0.01" min="0" defaultValue={Number(product.retailPrice)} className={inp} readOnly={!editable} /></label>
          <label><span className={lbl}>B2B price ($) <span className="text-neutral-400">optional</span></span><input name="b2bPrice" type="number" step="0.01" min="0" defaultValue={product.b2bPrice ? Number(product.b2bPrice) : ""} placeholder="uses retail" className={inp} readOnly={!editable} /></label>
          <label>
            <span className={lbl}>Visibility</span>
            <select name="visibility" defaultValue={product.visibility} className={inp} disabled={!editable}>
              <option value="both">Public + B2B</option>
              <option value="public">Public store only</option>
              <option value="b2b">B2B portal only</option>
            </select>
          </label>
        </Card>

        {editable && (
          <Card className="space-y-3">
            <label className="flex items-center gap-2 text-sm text-neutral-700"><input type="checkbox" name="published" defaultChecked={product.published} className="h-4 w-4" /> Published (live on the storefront)</label>
            <label className="flex items-center gap-2 text-sm text-neutral-700"><input type="checkbox" name="featured" defaultChecked={product.featured} className="h-4 w-4" /> Featured</label>
            <label className="flex items-center gap-2 text-sm text-neutral-700"><input type="checkbox" name="taxable" defaultChecked={product.taxable} className="h-4 w-4" /> Taxable</label>
          </Card>
        )}

        {editable && (
          <div className="flex items-center justify-between">
            <button className="rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700">Save product</button>
          </div>
        )}
      </form>

      {/* Variants / options (size, color, …) */}
      <Card className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Options / variants</h2>
          <p className="text-xs text-neutral-500">Add each purchasable option (e.g. &ldquo;Large / Navy&rdquo;). Price adjustment is added to the base price. Leave empty for a single-option product.</p>
        </div>

        {variants.length > 0 && (
          <ul className="divide-y divide-neutral-100 rounded-md border border-neutral-200">
            {variants.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <span className={`text-sm font-medium ${v.active ? "text-neutral-900" : "text-neutral-400 line-through"}`}>{v.label}</span>
                  <span className="ml-2 text-xs text-neutral-500">
                    {Number(v.priceDelta) !== 0 ? `${Number(v.priceDelta) > 0 ? "+" : ""}$${Number(v.priceDelta).toFixed(2)}` : "base price"}
                    {v.sku ? ` · ${v.sku}` : ""}
                  </span>
                </div>
                {editable && (
                  <div className="flex shrink-0 gap-2">
                    <form action={toggleVariantAction}><input type="hidden" name="id" value={v.id} /><button className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50">{v.active ? "Disable" : "Enable"}</button></form>
                    <form action={deleteVariantAction}><input type="hidden" name="id" value={v.id} /><ConfirmButton message="Delete this option?" className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100">Delete</ConfirmButton></form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {editable && (
          <form action={addVariantAction} className="flex flex-wrap items-end gap-2 border-t border-neutral-100 pt-4">
            <input type="hidden" name="productId" value={product.id} />
            <label className="flex-1 min-w-[10rem]"><span className={lbl}>Option label</span><input name="label" required placeholder="Large / Navy" className={inp} /></label>
            <label><span className={lbl}>SKU <span className="text-neutral-400">optional</span></span><input name="sku" className={`${inp} w-32`} /></label>
            <label><span className={lbl}>Price +/− ($)</span><input name="priceDelta" type="number" step="0.01" defaultValue="0" className={`${inp} w-28`} /></label>
            <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Add option</button>
          </form>
        )}
      </Card>

      {editable && (
        <Card className="flex items-center justify-between">
          <span className="text-sm text-neutral-500">Remove this product from the store (inventory is unaffected).</span>
          <form action={deleteStoreProductAction}>
            <input type="hidden" name="id" value={product.id} />
            <ConfirmButton message="Delete this store product?" className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100">Delete</ConfirmButton>
          </form>
        </Card>
      )}
    </div>
  );
}
