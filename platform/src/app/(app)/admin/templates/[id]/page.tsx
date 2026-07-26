import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { orderFormTemplates, templateItems } from "@/db/schema";
import { Card } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import type { ChargeRule, PriceBreak } from "@/lib/sales/pricing";
import { addChargeAction, removeChargeAction, addItemAction, updateItemAction, removeItemAction, setItemImageAction } from "@/lib/sales/template-actions";
import { TemplateMetaForm } from "./template-meta-form";
import { ItemPricingEditor } from "./item-pricing-editor";

const input = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-neutral-500";

export default async function TemplateEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await db.query.orderFormTemplates.findFirst({ where: eq(orderFormTemplates.id, id) });
  if (!t) notFound();
  const items = await db.select().from(templateItems).where(eq(templateItems.templateId, id)).orderBy(asc(templateItems.sortOrder));
  const charges = (t.charges as ChargeRule[] | null) ?? [];

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/admin/templates" className="text-sm text-neutral-500 hover:text-neutral-900">← Templates</Link>
      <Card>
        <h2 className="mb-4 text-sm font-semibold text-neutral-900">{t.name}</h2>
        <TemplateMetaForm id={t.id} name={t.name} description={t.description ?? ""} sizeOptions={(t.sizeOptions ?? []).join(", ")} defaultMarkupPct={Number(t.defaultMarkupPct)} active={t.active} />
      </Card>

      {/* Charge rules */}
      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Charge rules</h2>
        <ul className="mb-4 space-y-2">
          {charges.length === 0 && <li className="text-sm text-neutral-400">No charges. Add setup/decoration/rush charges below.</li>}
          {charges.map((c) => (
            <li key={c.key} className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-2 text-sm">
              <span className="text-neutral-800">{c.label} <span className="text-neutral-400">· {c.type} · {c.type === "percent" ? `${c.rate}%` : `$${c.rate}`}{c.unit ? ` / ${c.unit}` : ""}{c.appliesWhen && c.appliesWhen !== "always" ? ` · ${c.appliesWhen} only` : ""}</span></span>
              <form action={removeChargeAction}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="key" value={c.key} />
                <ConfirmButton message="Remove this charge?" className="text-xs text-red-600 hover:text-red-800">Remove</ConfirmButton>
              </form>
            </li>
          ))}
        </ul>
        <form action={addChargeAction} className="grid grid-cols-2 gap-2 sm:grid-cols-6">
          <input type="hidden" name="id" value={t.id} />
          <input name="label" required placeholder="Label" className={`col-span-2 ${input}`} />
          <select name="type" className={input}>
            <option value="flat">flat</option>
            <option value="per_unit">per_unit</option>
            <option value="per_color">per_color</option>
            <option value="per_hour">per_hour</option>
            <option value="percent">percent</option>
          </select>
          <input name="rate" type="number" step="0.01" placeholder="Rate" className={input} />
          <input name="unit" placeholder="unit (colors)" className={input} />
          <select name="appliesWhen" className={input}>
            <option value="always">always</option>
            <option value="new">new only</option>
            <option value="reorder">reorder only</option>
          </select>
          <button className="col-span-2 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700 sm:col-span-6">Add charge</button>
        </form>
      </Card>

      {/* Catalog items — cost + markup → sell price */}
      <Card>
        <h2 className="mb-1 text-sm font-semibold text-neutral-900">Item catalog</h2>
        <p className="mb-3 text-xs text-neutral-400">Enter supplier cost + markup % (blank markup uses the template default of {Number(t.defaultMarkupPct)}%). Sell price is computed. Vendor cost feeds can replace manual cost later.</p>
        <div className="mb-2 hidden grid-cols-[1fr_90px_80px_80px_auto] gap-2 px-1 text-xs font-medium uppercase tracking-wide text-neutral-400 sm:grid">
          <span>Item</span><span>Cost $</span><span>Markup %</span><span>Sell $</span><span></span>
        </div>
        <ul className="mb-4 space-y-1">
          {items.length === 0 && <li className="text-sm text-neutral-400">No catalog items — the Quote Builder will use free-text line items.</li>}
          {items.map((it) => (
            <li key={it.id}>
              <form action={updateItemAction} className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[1fr_90px_80px_80px_auto]">
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="itemId" value={it.id} />
                <span className="text-sm text-neutral-800">{it.name}{it.code ? <span className="text-neutral-400"> · {it.code}</span> : null}</span>
                <input name="supplierCost" type="number" step="0.01" defaultValue={Number(it.supplierCost)} className={input} />
                <input name="markupPct" type="number" step="0.01" defaultValue={it.markupPct === null ? "" : Number(it.markupPct)} placeholder="dflt" className={input} />
                <span className="text-sm font-medium text-neutral-900">${Number(it.unitPrice).toFixed(2)}</span>
                <span className="flex gap-2">
                  <button className="text-xs text-neutral-600 hover:text-neutral-900">Save</button>
                </span>
              </form>
              <ItemPricingEditor
                templateId={t.id}
                itemId={it.id}
                itemName={it.name}
                initialBreaks={(it.priceBreaks as PriceBreak[] | null) ?? null}
                initialMinQty={it.minQty}
                initialSizeUpcharges={(it.sizeUpcharges as Record<string, number> | null) ?? null}
                sizeOptions={t.sizeOptions ?? []}
              />
              <div className="mt-1 flex items-center gap-3 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2">
                {it.imageBase64 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`data:${it.imageMimeType ?? "image/png"};base64,${it.imageBase64}`} alt={it.name} className="h-12 w-12 rounded object-cover ring-1 ring-neutral-200" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded bg-neutral-200 text-[10px] text-neutral-500">no image</div>
                )}
                <form action={setItemImageAction} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="itemId" value={it.id} />
                  <input type="file" name="image" accept="image/*" className="text-xs text-neutral-600 file:mr-2 file:rounded file:border-0 file:bg-neutral-900 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-white" />
                  <button className="text-xs font-medium text-neutral-700 hover:text-neutral-900">Save image</button>
                </form>
                {it.imageBase64 && (
                  <form action={setItemImageAction}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="itemId" value={it.id} />
                    <input type="hidden" name="clear" value="1" />
                    <button className="text-[11px] text-red-600 hover:text-red-800">remove image</button>
                  </form>
                )}
              </div>
              <form action={removeItemAction} className="px-1">
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="itemId" value={it.id} />
                <ConfirmButton message="Remove this item?" className="text-[11px] text-red-600 hover:text-red-800">remove</ConfirmButton>
              </form>
            </li>
          ))}
        </ul>
        <form action={addItemAction} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_90px_80px_90px]">
          <input type="hidden" name="id" value={t.id} />
          <input name="name" required placeholder="Item name" className={input} />
          <input name="supplierCost" type="number" step="0.01" placeholder="Cost $" className={input} />
          <input name="markupPct" type="number" step="0.01" placeholder="Markup %" className={input} />
          <input name="code" placeholder="Code (opt)" className={input} />
          <button className="col-span-2 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700 sm:col-span-4">Add item</button>
        </form>
      </Card>
    </div>
  );
}
