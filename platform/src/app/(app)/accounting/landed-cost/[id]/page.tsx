import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { landedCostDocs, landedCostLines } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { allocateLanded } from "@/lib/inventory/landed-cost";
import { updateLandedMetaAction, addLandedLineAction, removeLandedLineAction, applyLandedDocAction } from "@/lib/inventory/landed-actions";

export const dynamic = "force-dynamic";
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money4 = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
const inp = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-brand";

export default async function LandedCostDocPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const user = await requireModule("inventory");
  const { id } = await params;
  const { err } = await searchParams;
  const doc = await db.query.landedCostDocs.findFirst({ where: eq(landedCostDocs.id, id) });
  if (!doc) notFound();
  const lines = await db.select().from(landedCostLines).where(eq(landedCostLines.docId, id)).orderBy(asc(landedCostLines.sortOrder));
  const editable = doc.status === "draft" && (canEdit(user.roles, "accounting") || canEdit(user.roles, "inventory"));

  const charges = Number(doc.freightAmount) + Number(doc.otherCharges);
  const basis = doc.basis === "value" ? "value" : "quantity";
  // Live preview while draft; frozen values once applied.
  const preview = allocateLanded(lines.map((l) => ({ qty: Number(l.qty), baseUnitCost: Number(l.baseUnitCost) })), charges, basis);
  const totalQty = lines.reduce((s, l) => s + Number(l.qty), 0);
  const totalVal = lines.reduce((s, l) => s + Number(l.qty) * Number(l.baseUnitCost), 0);

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/accounting/landed-cost" className="text-sm text-neutral-500 hover:text-neutral-900">← Landed cost</Link>
      <PageHeader
        title={`Landed cost · ${doc.docNumber}`}
        description={doc.status === "applied" ? "Applied — item costs updated." : "Draft — add the shipment's items and charges, then apply."}
        action={<span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${doc.status === "applied" ? "bg-emerald-100 text-emerald-700" : "bg-neutral-200 text-neutral-600"}`}>{doc.status}</span>}
      />

      {err === "empty" && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Add at least one item line before applying.</p>}

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Shipment &amp; charges</h2>
        {editable ? (
          <form action={updateLandedMetaAction} className="grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="id" value={doc.id} />
            <label className="text-xs text-neutral-500">Freight company<input name="vendor" defaultValue={doc.vendor ?? ""} className={`mt-1 w-full ${inp}`} /></label>
            <label className="text-xs text-neutral-500">Shipment ref (container/BOL)<input name="shipmentRef" defaultValue={doc.shipmentRef ?? ""} className={`mt-1 w-full ${inp}`} /></label>
            <label className="text-xs text-neutral-500">Spread by<select name="basis" defaultValue={basis} className={`mt-1 w-full ${inp}`}><option value="quantity">Quantity</option><option value="value">Value</option></select></label>
            <label className="text-xs text-neutral-500">Freight $<input name="freightAmount" type="number" step="0.01" defaultValue={Number(doc.freightAmount)} className={`mt-1 w-full ${inp}`} /></label>
            <label className="text-xs text-neutral-500">Other charges $<input name="otherCharges" type="number" step="0.01" defaultValue={Number(doc.otherCharges)} className={`mt-1 w-full ${inp}`} /></label>
            <label className="text-xs text-neutral-500">Other label (duty…)<input name="otherLabel" defaultValue={doc.otherLabel ?? ""} className={`mt-1 w-full ${inp}`} /></label>
            <label className="sm:col-span-3 text-xs text-neutral-500">Notes<input name="notes" defaultValue={doc.notes ?? ""} className={`mt-1 w-full ${inp}`} /></label>
            <div className="sm:col-span-3"><button className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Save</button></div>
          </form>
        ) : (
          <div className="grid gap-2 text-sm text-neutral-700 sm:grid-cols-3">
            <div>Freight company: <span className="font-medium">{doc.vendor ?? "—"}</span></div>
            <div>Shipment: <span className="font-medium">{doc.shipmentRef ?? "—"}</span></div>
            <div>Spread by: <span className="font-medium">{basis}</span></div>
            <div>Freight: <span className="font-medium">{money(Number(doc.freightAmount))}</span></div>
            <div>{doc.otherLabel || "Other"}: <span className="font-medium">{money(Number(doc.otherCharges))}</span></div>
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">Items on this shipment</h2>
          <span className="text-xs text-neutral-500">Total charges to spread: <span className="font-semibold text-neutral-800">{money(charges)}</span></span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-neutral-400">
              <tr><th className="py-1">SKU</th><th>Description</th><th className="text-right">Qty</th><th className="text-right">Base cost</th><th className="text-right">+ Freight</th><th className="text-right">Landed cost</th>{editable && <th></th>}</tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {lines.length === 0 && <tr><td colSpan={editable ? 7 : 6} className="py-4 text-center text-neutral-400">No items yet.</td></tr>}
              {lines.map((l, i) => {
                const alloc = doc.status === "applied" ? Number(l.allocated) : preview[i]?.allocated ?? 0;
                const landed = doc.status === "applied" ? Number(l.landedUnitCost) : preview[i]?.landedUnitCost ?? 0;
                return (
                  <tr key={l.id}>
                    <td className="py-1 pr-2 font-medium text-neutral-800">{l.sku ?? "—"}{!l.itemId && <span className="ml-1 text-[10px] text-amber-600" title="Not matched to an inventory item — its cost won't be updated">(unmatched)</span>}</td>
                    <td className="py-1 pr-2 text-neutral-600">{l.description ?? "—"}</td>
                    <td className="py-1 pr-2 text-right">{Number(l.qty)}</td>
                    <td className="py-1 pr-2 text-right">{money4(Number(l.baseUnitCost))}</td>
                    <td className="py-1 pr-2 text-right text-neutral-500">{money(alloc)}</td>
                    <td className="py-1 pr-2 text-right font-semibold text-neutral-900">{money4(landed)}</td>
                    {editable && (
                      <td className="py-1 text-right">
                        <form action={removeLandedLineAction} className="inline">
                          <input type="hidden" name="docId" value={doc.id} /><input type="hidden" name="lineId" value={l.id} />
                          <button className="text-neutral-400 hover:text-red-600" title="Remove">×</button>
                        </form>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            {lines.length > 0 && (
              <tfoot><tr className="border-t border-neutral-200 text-xs text-neutral-500"><td className="py-1" colSpan={2}>Totals</td><td className="py-1 text-right">{totalQty}</td><td className="py-1 text-right">{money(totalVal)}</td><td className="py-1 text-right">{money(preview.reduce((s, a) => s + a.allocated, 0))}</td><td></td>{editable && <td></td>}</tr></tfoot>
            )}
          </table>
        </div>

        {editable && (
          <form action={addLandedLineAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-neutral-100 pt-3">
            <input type="hidden" name="docId" value={doc.id} />
            <label className="text-xs text-neutral-500">SKU<input name="sku" placeholder="item SKU" className={`mt-1 w-32 ${inp}`} /></label>
            <label className="text-xs text-neutral-500">Description<input name="description" placeholder="(auto from SKU)" className={`mt-1 w-48 ${inp}`} /></label>
            <label className="text-xs text-neutral-500">Qty<input name="qty" type="number" step="0.01" className={`mt-1 w-20 ${inp}`} /></label>
            <label className="text-xs text-neutral-500">Base cost<input name="baseUnitCost" type="number" step="0.0001" placeholder="(auto)" className={`mt-1 w-24 ${inp}`} /></label>
            <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">Add item</button>
          </form>
        )}
      </Card>

      {editable && lines.length > 0 && (
        <form action={applyLandedDocAction} className="rounded-xl border border-neutral-200 bg-white p-4">
          <input type="hidden" name="id" value={doc.id} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-neutral-600">Applying freezes the allocation, updates each matched item&rsquo;s cost to its landed cost (base + freight share), and posts <span className="font-medium">Dr Inventory / Cr Landed Cost Clearing</span> to the GL. On-hand quantities are unchanged.</p>
            <button className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">Apply landed cost →</button>
          </div>
        </form>
      )}
      {doc.status === "applied" && (
        <div className="rounded-md bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
          <p>Applied{doc.appliedAt ? ` ${doc.appliedAt.toLocaleDateString("en-US")}` : ""}. Matched items&rsquo; costs were revalued to their landed cost, and <span className="font-medium">Dr Inventory / Cr Landed Cost Clearing</span> was posted to the GL.</p>
          <p className="mt-1 text-xs text-emerald-700">Code the freight/duty A/P bill to <span className="font-medium">Landed Cost Clearing</span> so the clearing account nets to zero.</p>
        </div>
      )}
    </div>
  );
}
