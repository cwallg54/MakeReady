import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { canDoArt } from "@/lib/art/access";
import { or } from "drizzle-orm";
import { db } from "@/db";
import { designItems, baseDesigns, businessPartners, designBarcodes } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { activateDesignItemAction } from "@/lib/designs/actions";

export const dynamic = "force-dynamic";
const inp = "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand";
const STATUS_BADGE: Record<string, string> = { active: "bg-emerald-100 text-emerald-700", draft: "bg-amber-100 text-amber-700", retired: "bg-neutral-200 text-neutral-600" };

export default async function DesignItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const user = await requireUser();
  if (!canDoArt(user.roles)) redirect("/403");
  const { id } = await params;
  const { err } = await searchParams;
  const item = await db.query.designItems.findFirst({ where: eq(designItems.id, id) });
  if (!item) notFound();
  const [base, bp, barcodes] = await Promise.all([
    item.baseDesignId ? db.query.baseDesigns.findFirst({ where: eq(baseDesigns.id, item.baseDesignId) }) : Promise.resolve(undefined),
    item.bpId ? db.query.businessPartners.findFirst({ where: eq(businessPartners.id, item.bpId) }) : Promise.resolve(undefined),
    db.select().from(designBarcodes).where(or(eq(designBarcodes.designItemId, id), eq(designBarcodes.designNumber, item.itemNumber))).limit(50),
  ]);
  const isDraft = item.status !== "active";

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/designs" className="text-sm text-neutral-500 hover:text-neutral-900">← Design Library</Link>
      <PageHeader
        title={item.itemNumber}
        description={`${base?.name ?? "Ad-hoc"}${item.suffix ? ` · ${item.suffix}` : ""}${item.colorVariant ? ` ${item.colorVariant}` : ""}`}
        action={<span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[item.status]}`}>{item.status}</span>}
      />

      {item.isException && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"><span className="font-semibold">Exception.</span> {item.exceptionReason || `Uses ${item.brandCode}.`}</div>
      )}
      {err === "gate" && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">An item number and a barcode are both required before this can be made orderable.</div>
      )}

      <div className="grid gap-6 sm:grid-cols-3">
        <Card className="sm:col-span-1">
          {item.imageBase64 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`data:${item.imageMimeType ?? "image/png"};base64,${item.imageBase64}`} alt={item.itemNumber} className="mx-auto max-h-56 w-auto rounded-md border border-neutral-200 object-contain" />
          ) : (
            <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-neutral-200 text-sm text-neutral-400">No art attached</div>
          )}
        </Card>
        <Card className="sm:col-span-2">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-neutral-400">Catalog</dt><dd className="uppercase text-neutral-900">{item.catalog}</dd></div>
            <div><dt className="text-xs text-neutral-400">Brand</dt><dd className="text-neutral-900">{item.brandCode}</dd></div>
            <div><dt className="text-xs text-neutral-400">Customer</dt><dd className="text-neutral-900">{bp?.companyName ?? item.custNumber ?? "—"}</dd></div>
            <div><dt className="text-xs text-neutral-400">Design base</dt><dd className="font-mono text-neutral-900">{item.designBase ?? base?.baseNumber ?? "—"}</dd></div>
            <div><dt className="text-xs text-neutral-400">Location</dt><dd className="text-neutral-900">{item.location ?? "—"}</dd></div>
            <div><dt className="text-xs text-neutral-400">Printing</dt><dd className="text-neutral-900">{item.printing ?? "—"}</dd></div>
            <div><dt className="text-xs text-neutral-400">Royalty</dt><dd className="text-neutral-900">{item.royalty ?? "—"}</dd></div>
            {item.stitchCount != null && <div><dt className="text-xs text-neutral-400">Stitch count</dt><dd className="text-neutral-900">{item.stitchCount.toLocaleString()}</dd></div>}
            <div><dt className="text-xs text-neutral-400">Salesperson</dt><dd className="text-neutral-900">{item.salesperson ?? "—"}</dd></div>
            <div><dt className="text-xs text-neutral-400">Assignee</dt><dd className="text-neutral-900">{item.assigneeInitials ?? "—"}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs text-neutral-400">Inventory item</dt><dd>{item.inventoryItemId ? <Link href={`/inventory/${item.inventoryItemId}`} className="text-brand-ink hover:underline">Open in inventory →</Link> : <span className="text-neutral-400">not created</span>}</dd></div>
          </dl>
        </Card>
      </div>

      {barcodes.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Barcodes ({barcodes.length})</h2>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[560px] text-xs">
              <thead className="text-left text-[10px] uppercase tracking-wide text-neutral-400"><tr><th className="py-1">12-digit</th><th className="py-1">10-digit</th><th className="py-1">Description</th><th className="py-1">Customer bc</th></tr></thead>
              <tbody className="divide-y divide-neutral-100">
                {barcodes.map((b) => (
                  <tr key={b.id}>
                    <td className="py-1 font-mono text-neutral-700">{b.barcode12 ?? "—"}</td>
                    <td className="py-1 font-mono text-neutral-500">{b.barcode10 ?? "—"}</td>
                    <td className="py-1 text-neutral-600">{b.description ?? "—"}</td>
                    <td className="py-1 font-mono text-neutral-500">{b.customerBarcode ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile card list */}
          <ul className="divide-y divide-neutral-100 text-xs lg:hidden">
            {barcodes.map((b) => (
              <li key={b.id} className="py-2">
                <div className="font-mono text-sm text-neutral-800">{b.barcode12 ?? b.customerBarcode ?? b.barcode10 ?? "—"}</div>
                {b.description && <div className="mt-0.5 text-neutral-600">{b.description}</div>}
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-neutral-500">
                  {b.barcode10 && <span className="font-mono">10-digit {b.barcode10}</span>}
                  {b.customerBarcode && b.customerBarcode !== b.barcode12 && <span className="font-mono">cust {b.customerBarcode}</span>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {isDraft && (
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-neutral-900">Make orderable</h2>
          <p className="mb-3 text-xs text-neutral-500">Fill in the item number and barcode to create the inventory item — sales can only order once this is done.</p>
          <form action={activateDesignItemAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={item.id} />
            {item.itemNumber.startsWith("DRAFT-") && <label className="text-xs text-neutral-500">Item number<input name="itemNumber" required className={`mt-1 w-40 font-mono ${inp}`} /></label>}
            {!item.barcodeNumber && item.barcodeSource === "customer" && <label className="text-xs text-neutral-500">Customer barcode<input name="barcodeNumber" required className={`mt-1 w-40 font-mono ${inp}`} /></label>}
            <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Create item &amp; activate</button>
          </form>
        </Card>
      )}
    </div>
  );
}
