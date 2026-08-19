import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { getCostCenter, departments } from "@/lib/controlling/costing";
import { updateCostCenterAction, setAllocationAction } from "@/lib/controlling/costing-actions";

export const dynamic = "force-dynamic";
const input = "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";
const label = "block text-xs font-medium uppercase tracking-wide text-neutral-500";

export default async function CostCenterDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireModule("controlling");
  const canDo = canEdit(user.roles, "controlling");
  const data = await getCostCenter(id);
  if (!data) notFound();
  const { cc, allocations } = data;
  const depts = cc.kind === "overhead" ? await departments() : [];
  const allocBy = new Map(allocations.map((a) => [a.toCostCenterId, Number(a.pct)]));
  const totalPct = allocations.reduce((s, a) => s + Number(a.pct), 0);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title={`${cc.code} · ${cc.name}`} description={cc.kind === "overhead" ? "Overhead pool — spreads to departments by allocation." : "Department cost center."} />
        <Link href="/controlling/cost-centers" className="text-sm text-neutral-500 hover:underline">← Cost centers</Link>
      </div>

      <Card>
        <form action={updateCostCenterAction} className="space-y-4">
          <input type="hidden" name="id" value={cc.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className={label}>Name</label><input name="name" defaultValue={cc.name} className={input} disabled={!canDo} /></div>
            <div>
              <label className={label}>Type</label>
              <select name="kind" defaultValue={cc.kind} className={input} disabled={!canDo}><option value="department">Department</option><option value="overhead">Overhead pool</option></select>
            </div>
            <div><label className={label}>Labor rate / hour</label><input name="laborRatePerHour" defaultValue={Number(cc.laborRatePerHour).toFixed(2)} inputMode="decimal" className={input} disabled={!canDo} /></div>
            <div className="flex items-end"><label className="flex items-center gap-2 text-sm text-neutral-600"><input type="checkbox" name="active" defaultChecked={cc.active} disabled={!canDo} /> Active</label></div>
          </div>
          <div><label className={label}>Description</label><textarea name="description" rows={2} defaultValue={cc.description ?? ""} className={input} disabled={!canDo} /></div>
          {canDo && <div className="flex justify-end"><button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Save</button></div>}
        </form>
      </Card>

      {cc.kind === "overhead" && (
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900">Allocation to departments</h2>
            <span className={`text-xs font-medium ${Math.round(totalPct) === 100 ? "text-emerald-600" : "text-amber-600"}`}>{totalPct.toFixed(0)}% allocated</span>
          </div>
          <p className="mt-1 text-xs text-neutral-500">Set the share of this pool that each department absorbs. Percentages are normalized, so they don&apos;t have to sum to exactly 100.</p>
          <div className="mt-3 space-y-2">
            {depts.length === 0 && <p className="text-sm text-neutral-400">Create department cost centers first.</p>}
            {depts.map((d) => (
              <form action={setAllocationAction} key={d.id} className="flex items-center gap-3">
                <input type="hidden" name="fromId" value={cc.id} />
                <input type="hidden" name="toId" value={d.id} />
                <span className="w-40 text-sm text-neutral-700">{d.code} · {d.name}</span>
                <input name="pct" defaultValue={(allocBy.get(d.id) ?? 0).toString()} inputMode="decimal" className="w-24 rounded-md border border-neutral-300 px-2 py-1 text-sm" disabled={!canDo} />
                <span className="text-sm text-neutral-400">%</span>
                {canDo && <button className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50">Set</button>}
              </form>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
