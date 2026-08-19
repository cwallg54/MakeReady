import Link from "next/link";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { listEquipment, maintenanceSummary } from "@/lib/maintenance/data";
import { createEquipmentAction } from "@/lib/maintenance/actions";

export const dynamic = "force-dynamic";
const input = "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";
const label = "block text-xs font-medium uppercase tracking-wide text-neutral-500";
const TYPES = ["press", "dryer", "embroidery_machine", "dtf_printer", "heat_press", "compressor", "vehicle", "other"];
const STATUS_STYLE: Record<string, string> = {
  operational: "bg-emerald-100 text-emerald-700",
  needs_service: "bg-amber-100 text-amber-700",
  down: "bg-red-100 text-red-700",
  retired: "bg-neutral-200 text-neutral-600",
};

export default async function MaintenancePage() {
  const user = await requireModule("maintenance");
  const canDo = canEdit(user.roles, "maintenance");
  const [rows, summary] = await Promise.all([listEquipment(), maintenanceSummary()]);

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Equipment maintenance" description="The shop-floor equipment register with preventive-maintenance schedules and work orders — keeping presses, dryers, and machines running." />
        <Link href="/maintenance/work-orders" className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Work orders</Link>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Operational" value={summary.operational} />
        <StatCard label="Down / needs service" value={summary.down} />
        <StatCard label="PM due (7 days)" value={summary.dueSoon} />
        <StatCard label="Open work orders" value={summary.openWorkOrders} />
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-neutral-400">
            <tr><th className="py-1">Equipment</th><th className="py-1">Type</th><th className="py-1">Location</th><th className="py-1">Status</th><th className="py-1 text-right">Open WOs</th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-neutral-400">No equipment registered yet.</td></tr>}
            {rows.map((e) => (
              <tr key={e.id} className="hover:bg-neutral-50">
                <td className="py-1.5"><Link href={`/maintenance/${e.id}`} className="font-medium text-neutral-900 hover:underline">{e.name}</Link> <span className="text-xs text-neutral-400">{e.code}</span></td>
                <td className="py-1.5 capitalize text-neutral-500">{e.type.replace(/_/g, " ")}</td>
                <td className="py-1.5 text-neutral-500">{e.location ?? "—"}</td>
                <td className="py-1.5"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[e.status] ?? "bg-neutral-100 text-neutral-600"}`}>{e.status.replace(/_/g, " ")}</span></td>
                <td className="py-1.5 text-right text-neutral-700">{e.openWorkOrders || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {canDo && (
        <Card>
          <h2 className="text-sm font-semibold text-neutral-900">Add equipment</h2>
          <form action={createEquipmentAction} className="mt-3 grid gap-3 sm:grid-cols-2">
            <div><label className={label}>Name</label><input name="name" placeholder="M&R Sportsman EX" className={input} required /></div>
            <div>
              <label className={label}>Type</label>
              <select name="type" defaultValue="press" className={input}>{TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</select>
            </div>
            <div><label className={label}>Location</label><input name="location" placeholder="Silkscreen floor" className={input} /></div>
            <div><label className={label}>Serial number</label><input name="serialNumber" className={input} /></div>
            <div className="sm:col-span-2 flex justify-end"><button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Add equipment</button></div>
          </form>
        </Card>
      )}
    </div>
  );
}
