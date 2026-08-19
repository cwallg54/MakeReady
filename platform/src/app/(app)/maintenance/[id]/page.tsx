import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { getEquipment, assignableUsers } from "@/lib/maintenance/data";
import { updateEquipmentAction, addScheduleAction, completeScheduleAction, removeScheduleAction, createWorkOrderAction } from "@/lib/maintenance/actions";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";
const input = "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";
const smInput = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm";
const label = "block text-xs font-medium uppercase tracking-wide text-neutral-500";
const TYPES = ["press", "dryer", "embroidery_machine", "dtf_printer", "heat_press", "compressor", "vehicle", "other"];
const STATUSES = ["operational", "needs_service", "down", "retired"];
const WO_STYLE: Record<string, string> = { open: "bg-blue-100 text-blue-700", in_progress: "bg-amber-100 text-amber-700", completed: "bg-emerald-100 text-emerald-700", canceled: "bg-neutral-200 text-neutral-600" };
const fmtInput = (d: Date | null) => (d ? DateTime.fromJSDate(d).toISODate() ?? "" : "");

export default async function EquipmentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireModule("maintenance");
  const canDo = canEdit(user.roles, "maintenance");
  const data = await getEquipment(id);
  if (!data) notFound();
  const { eqp, schedules, workOrders } = data;
  const staff = canDo ? await assignableUsers() : [];
  const now = Date.now();

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title={eqp.name} description={`${eqp.code} · ${eqp.type.replace(/_/g, " ")}`} />
        <Link href="/maintenance" className="text-sm text-neutral-500 hover:underline">← Equipment</Link>
      </div>

      <Card>
        <form action={updateEquipmentAction} className="space-y-4">
          <input type="hidden" name="id" value={eqp.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className={label}>Name</label><input name="name" defaultValue={eqp.name} className={input} disabled={!canDo} /></div>
            <div><label className={label}>Type</label><select name="type" defaultValue={eqp.type} className={input} disabled={!canDo}>{TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</select></div>
            <div><label className={label}>Location</label><input name="location" defaultValue={eqp.location ?? ""} className={input} disabled={!canDo} /></div>
            <div><label className={label}>Serial number</label><input name="serialNumber" defaultValue={eqp.serialNumber ?? ""} className={input} disabled={!canDo} /></div>
            <div><label className={label}>Status</label><select name="status" defaultValue={eqp.status} className={input} disabled={!canDo}>{STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}</select></div>
            <div><label className={label}>Purchase date</label><input name="purchaseDate" type="date" defaultValue={fmtInput(eqp.purchaseDate)} className={input} disabled={!canDo} /></div>
          </div>
          <div><label className={label}>Notes</label><textarea name="notes" rows={2} defaultValue={eqp.notes ?? ""} className={input} disabled={!canDo} /></div>
          {canDo && <div className="flex justify-end"><button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Save</button></div>}
        </form>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-neutral-900">Preventive maintenance schedules</h2>
        {schedules.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">No PM schedules. Add one to get due-date reminders.</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <tbody className="divide-y divide-neutral-100">
              {schedules.map((s) => {
                const overdue = s.nextDueDate && s.nextDueDate.getTime() < now;
                return (
                  <tr key={s.id}>
                    <td className="py-1.5 text-neutral-700">{s.task}</td>
                    <td className="py-1.5 text-neutral-500">every {s.intervalDays}d</td>
                    <td className={`py-1.5 ${overdue ? "font-medium text-red-600" : "text-neutral-600"}`}>due {fmtDate(s.nextDueDate)}</td>
                    {canDo && (
                      <td className="py-1.5 text-right">
                        <form action={completeScheduleAction} className="inline"><input type="hidden" name="id" value={s.id} /><input type="hidden" name="equipmentId" value={eqp.id} /><button className="mr-3 text-xs font-medium text-emerald-700 hover:underline">Mark done</button></form>
                        <form action={removeScheduleAction} className="inline"><input type="hidden" name="id" value={s.id} /><input type="hidden" name="equipmentId" value={eqp.id} /><button className="text-xs text-neutral-400 hover:text-red-600">✕</button></form>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {canDo && (
          <form action={addScheduleAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-neutral-100 pt-3">
            <input type="hidden" name="equipmentId" value={eqp.id} />
            <input name="task" placeholder="Task (e.g. lubricate carriage)" className={`${smInput} flex-1 min-w-[10rem]`} />
            <input name="intervalDays" type="number" min={1} defaultValue={30} className={`${smInput} w-24`} title="Interval (days)" />
            <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">Add schedule</button>
          </form>
        )}
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-neutral-900">Work orders</h2>
        {workOrders.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">No work orders on this machine.</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <tbody className="divide-y divide-neutral-100">
              {workOrders.map((w) => (
                <tr key={w.id} className="hover:bg-neutral-50">
                  <td className="py-1.5"><Link href={`/maintenance/work-orders/${w.id}`} className="font-medium text-neutral-900 hover:underline">{w.woNumber}</Link></td>
                  <td className="py-1.5 capitalize text-neutral-500">{w.type}</td>
                  <td className="py-1.5 text-neutral-500">{w.assignee ?? "unassigned"}</td>
                  <td className="py-1.5"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${WO_STYLE[w.status]}`}>{w.status.replace(/_/g, " ")}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {canDo && (
          <form action={createWorkOrderAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-neutral-100 pt-3">
            <input type="hidden" name="equipmentId" value={eqp.id} />
            <select name="type" defaultValue="repair" className={smInput}><option value="preventive">Preventive</option><option value="repair">Repair</option><option value="inspection">Inspection</option></select>
            <select name="priority" defaultValue="normal" className={smInput}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select>
            <select name="assignedTo" defaultValue="" className={smInput}><option value="">Assign…</option>{staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
            <input name="description" placeholder="What's wrong / to do" className={`${smInput} flex-1 min-w-[10rem]`} />
            <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">New work order</button>
          </form>
        )}
      </Card>
    </div>
  );
}
