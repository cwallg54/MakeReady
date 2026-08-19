import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { getAsset } from "@/lib/assets/data";
import { updateAssetAction, disposeAssetAction } from "@/lib/assets/actions";

export const dynamic = "force-dynamic";
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const CATEGORIES = ["equipment", "vehicle", "furniture", "computer", "building", "leasehold", "other"];
const input = "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";
const label = "block text-xs font-medium uppercase tracking-wide text-neutral-500";
const fmtDate = (d: Date | null) => (d ? DateTime.fromJSDate(d).toISODate() ?? "" : "");

export default async function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireModule("accounting");
  const canDo = canEdit(user.roles, "accounting");
  const data = await getAsset(id);
  if (!data) notFound();
  const { asset: a, calc, history } = data;
  const disposed = a.status === "disposed";

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title={a.name} description={`${a.assetNumber} · ${a.category}`} />
        <Link href="/accounting/assets" className="text-sm text-neutral-500 hover:underline">← All assets</Link>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Cost" value={money(Number(a.cost))} />
        <StatCard label="Accumulated" value={money(calc.accumulated)} hint={`${money(calc.monthly)}/mo`} />
        <StatCard label="Net book value" value={money(calc.netBookValue)} />
        <StatCard label="Status" value={a.status.replace("_", " ")} hint={disposed && a.disposedDate ? `Disposed ${fmtDate(a.disposedDate)}` : `${a.usefulLifeMonths} mo life`} />
      </div>

      {!disposed && (
        <Card>
          <h2 className="text-sm font-semibold text-neutral-900">Asset details</h2>
          <form action={updateAssetAction} className="mt-4 space-y-4">
            <input type="hidden" name="id" value={a.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className={label}>Name</label><input name="name" defaultValue={a.name} className={input} disabled={!canDo} /></div>
              <div>
                <label className={label}>Category</label>
                <select name="category" defaultValue={a.category} className={input} disabled={!canDo}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div><label className={label}>Cost</label><input name="cost" defaultValue={Number(a.cost).toFixed(2)} inputMode="decimal" className={input} disabled={!canDo} /></div>
              <div><label className={label}>Salvage</label><input name="salvageValue" defaultValue={Number(a.salvageValue).toFixed(2)} inputMode="decimal" className={input} disabled={!canDo} /></div>
              <div><label className={label}>Life (months)</label><input name="usefulLifeMonths" type="number" min={1} defaultValue={a.usefulLifeMonths} className={input} disabled={!canDo} /></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className={label}>Acquisition date</label><input name="acquisitionDate" type="date" defaultValue={fmtDate(a.acquisitionDate)} className={input} disabled={!canDo} /></div>
              <div><label className={label}>In-service date</label><input name="inServiceDate" type="date" defaultValue={fmtDate(a.inServiceDate)} className={input} disabled={!canDo} /></div>
            </div>
            <div><label className={label}>Notes</label><textarea name="notes" rows={2} defaultValue={a.notes ?? ""} className={input} disabled={!canDo} /></div>
            {canDo && <div className="flex justify-end"><button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Save changes</button></div>}
          </form>
        </Card>
      )}

      <Card>
        <h2 className="text-sm font-semibold text-neutral-900">Depreciation history</h2>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">No depreciation posted yet. Run a monthly depreciation from the Depreciation runs screen.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-neutral-400">
              <tr><th className="py-1">Period</th><th className="py-1">Run</th><th className="py-1 text-right">Amount</th></tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {history.map((h) => (
                <tr key={h.id}><td className="py-1.5 text-neutral-700">{h.periodYm}</td><td className="py-1.5 text-neutral-500">{h.runNumber}</td><td className="py-1.5 text-right text-neutral-700">{money(Number(h.amount))}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {canDo && !disposed && (
        <Card className="border-amber-200 bg-amber-50/40">
          <h2 className="text-sm font-semibold text-neutral-900">Dispose of this asset</h2>
          <p className="mt-1 text-xs text-neutral-500">Removes the asset from the register and books the disposal to the GL (removes cost + accumulated depreciation, records any proceeds, and recognizes the gain or loss). Net book value today is <span className="font-medium">{money(calc.netBookValue)}</span>.</p>
          <form action={disposeAssetAction} className="mt-3 flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={a.id} />
            <div><label className={label}>Proceeds</label><input name="proceeds" inputMode="decimal" placeholder="0.00" className={`${input} w-32`} /></div>
            <div><label className={label}>Date</label><input name="disposedDate" type="date" defaultValue={DateTime.now().toISODate()} className={`${input} w-40`} /></div>
            <div className="flex-1 min-w-[10rem]"><label className={label}>Note</label><input name="note" placeholder="Sold / scrapped / traded" className={input} /></div>
            <button className="rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700">Dispose</button>
          </form>
        </Card>
      )}

      {disposed && (
        <Card className="bg-neutral-50">
          <p className="text-sm text-neutral-600">Disposed on {fmtDate(a.disposedDate)} for {money(Number(a.disposalProceeds ?? 0))}. {a.disposalNote}</p>
        </Card>
      )}
    </div>
  );
}
