import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { getWorkOrder, assignableUsers } from "@/lib/maintenance/data";
import { updateWorkOrderAction } from "@/lib/maintenance/actions";

export const dynamic = "force-dynamic";
const input = "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";
const label = "block text-xs font-medium uppercase tracking-wide text-neutral-500";
const fmtInput = (d: Date | null) => (d ? DateTime.fromJSDate(d).toISODate() ?? "" : "");

export default async function WorkOrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireModule("maintenance");
  const canDo = canEdit(user.roles, "maintenance");
  const wo = await getWorkOrder(id);
  if (!wo) notFound();
  const staff = canDo ? await assignableUsers() : [];

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title={wo.woNumber} description={`${wo.type} · ${wo.equipmentName ?? ""} (${wo.equipmentCode ?? ""})`} />
        {wo.equipmentId && <Link href={`/maintenance/${wo.equipmentId}`} className="text-sm text-neutral-500 hover:underline">← Equipment</Link>}
      </div>

      <Card>
        <form action={updateWorkOrderAction} className="space-y-4">
          <input type="hidden" name="id" value={wo.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className={label}>Status</label><select name="status" defaultValue={wo.status} className={input} disabled={!canDo}><option value="open">Open</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="canceled">Canceled</option></select></div>
            <div><label className={label}>Priority</label><select name="priority" defaultValue={wo.priority} className={input} disabled={!canDo}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>
            <div><label className={label}>Assigned to</label><select name="assignedTo" defaultValue={wo.assignedTo ?? ""} className={input} disabled={!canDo}><option value="">Unassigned</option>{staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
            <div><label className={label}>Scheduled date</label><input name="scheduledDate" type="date" defaultValue={fmtInput(wo.scheduledDate)} className={input} disabled={!canDo} /></div>
            <div><label className={label}>Downtime (minutes)</label><input name="downtimeMinutes" type="number" min={0} defaultValue={wo.downtimeMinutes} className={input} disabled={!canDo} /></div>
            <div><label className={label}>Cost</label><input name="cost" inputMode="decimal" defaultValue={Number(wo.cost).toFixed(2)} className={input} disabled={!canDo} /></div>
          </div>
          <div><label className={label}>Description</label><textarea name="description" rows={2} defaultValue={wo.description ?? ""} className={input} disabled={!canDo} /></div>
          <div><label className={label}>Resolution</label><textarea name="resolution" rows={2} defaultValue={wo.resolution ?? ""} className={input} disabled={!canDo} placeholder="What was done to fix it" /></div>
          {canDo && <div className="flex justify-end"><button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Save work order</button></div>}
        </form>
        <p className="mt-3 text-xs text-neutral-400">Completing a work order restores the machine to operational (when no other work orders are open) and advances any linked PM schedule.</p>
      </Card>
    </div>
  );
}
