import Link from "next/link";
import { requireModule } from "@/lib/auth/guards";
import { PageHeader, Card } from "@/components/ui";
import { listWorkOrders } from "@/lib/maintenance/data";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";
const WO_STYLE: Record<string, string> = { open: "bg-blue-100 text-blue-700", in_progress: "bg-amber-100 text-amber-700", completed: "bg-emerald-100 text-emerald-700", canceled: "bg-neutral-200 text-neutral-600" };
const PRIORITY_STYLE: Record<string, string> = { low: "text-neutral-400", normal: "text-neutral-500", high: "text-amber-600", urgent: "text-red-600 font-semibold" };

export default async function WorkOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireModule("maintenance");
  const { status } = await searchParams;
  const rows = await listWorkOrders(status);
  const tabs = [["", "All"], ["open", "Open"], ["in_progress", "In progress"], ["completed", "Completed"]] as const;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Maintenance work orders" description="Repairs, preventive tasks, and inspections across all equipment." />
        <div className="flex items-center gap-3">
          <a href={`/maintenance/work-orders/export${status ? `?status=${status}` : ""}`} className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Export CSV</a>
          <Link href="/maintenance" className="text-sm text-neutral-500 hover:underline">← Equipment</Link>
        </div>
      </div>

      <div className="flex gap-2">
        {tabs.map(([v, l]) => (
          <Link key={v} href={v ? `/maintenance/work-orders?status=${v}` : "/maintenance/work-orders"} className={`rounded-full px-3 py-1 text-sm ${(status ?? "") === v ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}>{l}</Link>
        ))}
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-neutral-400">
            <tr><th className="py-1">WO</th><th className="py-1">Equipment</th><th className="py-1">Type</th><th className="py-1">Priority</th><th className="py-1">Status</th><th className="py-1">Scheduled</th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-neutral-400">No work orders.</td></tr>}
            {rows.map((w) => (
              <tr key={w.id} className="hover:bg-neutral-50">
                <td className="py-1.5"><Link href={`/maintenance/work-orders/${w.id}`} className="font-medium text-neutral-900 hover:underline">{w.woNumber}</Link></td>
                <td className="py-1.5 text-neutral-600">{w.equipmentName ?? "—"}</td>
                <td className="py-1.5 capitalize text-neutral-500">{w.type}</td>
                <td className={`py-1.5 capitalize ${PRIORITY_STYLE[w.priority]}`}>{w.priority}</td>
                <td className="py-1.5"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${WO_STYLE[w.status]}`}>{w.status.replace(/_/g, " ")}</span></td>
                <td className="py-1.5 text-neutral-500">{w.scheduledDate ? fmtDate(w.scheduledDate) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
