import Link from "next/link";
import { DateTime } from "luxon";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { costByCenter } from "@/lib/controlling/costing";
import { createCostCenterAction } from "@/lib/controlling/costing-actions";

export const dynamic = "force-dynamic";
const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const input = "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";
const label = "block text-xs font-medium uppercase tracking-wide text-neutral-500";

export default async function CostCentersPage() {
  const user = await requireModule("controlling");
  const canDo = canEdit(user.roles, "controlling");
  const from = DateTime.now().startOf("year").toJSDate();
  const centers = await costByCenter(from);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Cost centers" description="Departments and overhead pools with fully-burdened labor rates. Captured job costs roll up here; overhead pools spread onto departments by allocation." />
        <Link href="/controlling" className="text-sm text-neutral-500 hover:underline">← Controlling</Link>
      </div>

      <Card>
        <h2 className="text-sm font-semibold text-neutral-900">Cost by center · YTD</h2>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-neutral-400">
            <tr><th className="py-1">Center</th><th className="py-1">Type</th><th className="py-1 text-right">Rate/hr</th><th className="py-1 text-right">Direct</th><th className="py-1 text-right">+ Overhead</th><th className="py-1 text-right">Burdened</th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {centers.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-neutral-400">No cost centers yet.</td></tr>}
            {centers.map((c) => (
              <tr key={c.id} className={c.active ? "" : "opacity-50"}>
                <td className="py-1.5"><Link href={`/controlling/cost-centers/${c.id}`} className="font-medium text-neutral-900 hover:underline">{c.code}</Link> <span className="text-neutral-500">{c.name}</span></td>
                <td className="py-1.5 capitalize text-neutral-500">{c.kind}</td>
                <td className="py-1.5 text-right text-neutral-600">${Number(c.laborRatePerHour).toFixed(0)}</td>
                <td className="py-1.5 text-right text-neutral-700">{money(c.direct)}</td>
                <td className="py-1.5 text-right text-neutral-500">{c.kind === "department" ? money(c.allocatedIn) : "—"}</td>
                <td className="py-1.5 text-right font-medium text-neutral-900">{c.kind === "department" ? money(c.fullyBurdened) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {canDo && (
        <Card>
          <h2 className="text-sm font-semibold text-neutral-900">New cost center</h2>
          <form action={createCostCenterAction} className="mt-3 grid gap-3 sm:grid-cols-2">
            <div><label className={label}>Code</label><input name="code" placeholder="SS" className={input} /></div>
            <div><label className={label}>Name</label><input name="name" placeholder="Silkscreen" className={input} /></div>
            <div>
              <label className={label}>Type</label>
              <select name="kind" className={input} defaultValue="department"><option value="department">Department</option><option value="overhead">Overhead pool</option></select>
            </div>
            <div><label className={label}>Labor rate / hour</label><input name="laborRatePerHour" inputMode="decimal" placeholder="0.00" className={input} /></div>
            <div className="sm:col-span-2 flex justify-end"><button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Create</button></div>
          </form>
        </Card>
      )}
    </div>
  );
}
