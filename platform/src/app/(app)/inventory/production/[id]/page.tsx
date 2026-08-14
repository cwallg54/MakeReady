import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { productionOrders, productionOrderLines, bins, warehouses } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { updateProductionMetaAction, addProductionLineAction, removeProductionLineAction, postProductionOrderAction } from "@/lib/inventory/production-order-actions";

export const dynamic = "force-dynamic";
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money4 = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
const inp = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-brand";
const ERR: Record<string, string> = {
  incomplete: "Add at least one blank (consume) and one finished good (produce) before posting.",
  unmatched: "Every line must match an inventory SKU and have a bin.",
  stock: "A blank line doesn't have enough stock in its bin.",
};

export default async function ProductionOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const user = await requireModule("inventory");
  const { id } = await params;
  const { err } = await searchParams;
  const doc = await db.query.productionOrders.findFirst({ where: eq(productionOrders.id, id) });
  if (!doc) notFound();
  const [lines, binRows] = await Promise.all([
    db.select().from(productionOrderLines).where(eq(productionOrderLines.docId, id)).orderBy(asc(productionOrderLines.sortOrder)),
    db.select({ id: bins.id, code: bins.code, wh: warehouses.name }).from(bins).innerJoin(warehouses, eq(warehouses.id, bins.warehouseId)).where(eq(bins.active, true)).orderBy(asc(warehouses.name), asc(bins.code)),
  ]);
  const editable = doc.status === "draft" && (canEdit(user.roles, "inventory") || canEdit(user.roles, "accounting"));
  const binLabel = (bid: string | null) => { const b = binRows.find((x) => x.id === bid); return b ? `${b.wh} · ${b.code}` : "—"; };

  const consume = lines.filter((l) => l.kind === "consume");
  const produce = lines.filter((l) => l.kind === "produce");
  const consumedCost = consume.reduce((s, l) => s + Number(l.qty) * Number(l.unitCost), 0);
  const producedQty = produce.reduce((s, l) => s + Number(l.qty), 0);
  const addedCost = Number(doc.addedCost);
  const finishedUnit = producedQty > 0 ? (consumedCost + addedCost) / producedQty : 0;

  const lineTable = (rows: typeof lines, kind: "consume" | "produce") => (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase text-neutral-400"><tr><th className="py-1">SKU</th><th>Item</th><th className="text-right">Qty</th><th>Bin</th><th className="text-right">{kind === "consume" ? "Unit cost" : "Landed unit"}</th>{editable && <th></th>}</tr></thead>
      <tbody className="divide-y divide-neutral-100">
        {rows.length === 0 && <tr><td colSpan={editable ? 6 : 5} className="py-3 text-center text-neutral-400">None yet.</td></tr>}
        {rows.map((l) => (
          <tr key={l.id}>
            <td className="py-1 pr-2 font-medium text-neutral-800">{l.sku}{!l.itemId && <span className="ml-1 text-[10px] text-amber-600">(unmatched)</span>}</td>
            <td className="py-1 pr-2 text-neutral-600">{l.description ?? "—"}</td>
            <td className="py-1 pr-2 text-right">{Number(l.qty)}</td>
            <td className="py-1 pr-2 text-neutral-500">{binLabel(l.binId)}</td>
            <td className="py-1 pr-2 text-right">{kind === "consume" ? money4(Number(l.unitCost)) : doc.status === "posted" ? money4(Number(l.unitCost)) : money4(finishedUnit)}</td>
            {editable && (
              <td className="py-1 text-right">
                <form action={removeProductionLineAction} className="inline"><input type="hidden" name="docId" value={doc.id} /><input type="hidden" name="lineId" value={l.id} /><button className="text-neutral-400 hover:text-red-600" title="Remove">×</button></form>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );

  const addLineForm = (kind: "consume" | "produce") => (
    <form action={addProductionLineAction} className="mt-2 flex flex-wrap items-end gap-2 border-t border-neutral-100 pt-2">
      <input type="hidden" name="docId" value={doc.id} />
      <input type="hidden" name="kind" value={kind} />
      <label className="text-xs text-neutral-500">SKU<input name="sku" placeholder={kind === "consume" ? "blank SKU" : "finished SKU"} className={`mt-1 w-32 ${inp}`} /></label>
      <label className="text-xs text-neutral-500">Qty<input name="qty" type="number" step="1" className={`mt-1 w-20 ${inp}`} /></label>
      <label className="text-xs text-neutral-500">Bin
        <select name="binId" className={`mt-1 w-44 ${inp}`}>
          <option value="">— bin —</option>
          {binRows.map((b) => <option key={b.id} value={b.id}>{b.wh} · {b.code}</option>)}
        </select>
      </label>
      <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">Add {kind === "consume" ? "blank" : "finished good"}</button>
    </form>
  );

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/inventory/production" className="text-sm text-neutral-500 hover:text-neutral-900">← In-house production</Link>
      <PageHeader
        title={`Production · ${doc.docNumber}`}
        description={doc.status === "posted" ? "Posted — stock moved and finished-good cost set." : "Draft — add blanks to consume and finished goods to produce, then post."}
        action={<span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${doc.status === "posted" ? "bg-emerald-100 text-emerald-700" : "bg-neutral-200 text-neutral-600"}`}>{doc.status}</span>}
      />
      {err && ERR[err] && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{ERR[err]}</p>}

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">Blanks consumed</h2>
        {lineTable(consume, "consume")}
        {editable && addLineForm("consume")}
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">Finished goods produced</h2>
        {lineTable(produce, "produce")}
        {editable && addLineForm("produce")}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Cost roll-up</h2>
        {editable ? (
          <form action={updateProductionMetaAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={doc.id} />
            <label className="text-xs text-neutral-500">Added labor/overhead to capitalize $<input name="addedCost" type="number" step="0.01" defaultValue={Number(doc.addedCost)} className={`mt-1 w-32 ${inp}`} /></label>
            <label className="text-xs text-neutral-500">Notes<input name="notes" defaultValue={doc.notes ?? ""} className={`mt-1 w-64 ${inp}`} /></label>
            <button className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Save</button>
          </form>
        ) : (
          <p className="text-sm text-neutral-600">Added labor/overhead: {money(addedCost)}{doc.notes ? ` · ${doc.notes}` : ""}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-sm">
          <div><dt className="text-neutral-400">Blank cost consumed</dt><dd className="font-medium text-neutral-900">{money(consumedCost)}</dd></div>
          <div><dt className="text-neutral-400">+ Added labor</dt><dd className="text-neutral-700">{money(addedCost)}</dd></div>
          <div><dt className="text-neutral-400">Produced qty</dt><dd className="text-neutral-700">{producedQty}</dd></div>
          <div><dt className="text-neutral-400">Finished unit cost</dt><dd className="text-lg font-bold text-neutral-900">{money4(finishedUnit)}</dd></div>
        </div>
      </Card>

      {editable && consume.length > 0 && produce.length > 0 && (
        <form action={postProductionOrderAction} className="rounded-xl border border-neutral-200 bg-white p-4">
          <input type="hidden" name="id" value={doc.id} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-neutral-600">Posting consumes the blanks, receives the finished goods, and sets each finished item&rsquo;s cost. Any added labor posts <span className="font-medium">Dr Inventory / Cr Production Labor Applied</span>.</p>
            <button className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">Post production →</button>
          </div>
        </form>
      )}
      {doc.status === "posted" && <p className="text-sm text-emerald-700">Posted{doc.postedAt ? ` ${doc.postedAt.toLocaleDateString("en-US")}` : ""}. Blanks were consumed and finished goods received; the manual SO+PO and monthly COGS journal are no longer needed.</p>}
    </div>
  );
}
