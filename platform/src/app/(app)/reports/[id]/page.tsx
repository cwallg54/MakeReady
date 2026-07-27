import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reportDefinitions, reportSchedules } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canBuildReports, sourceMeta, type ReportConfig } from "@/lib/reports/sources";
import { runReport, displayValue } from "@/lib/reports/run";
import { deleteReport, saveSchedule, deleteSchedule } from "@/lib/reports/actions";
import { PageHeader, Card } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const input = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-neutral-500";
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MAX_SHOWN = 500;

export default async function ReportViewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canBuildReports(user.roles)) redirect("/403");
  const { id } = await params;

  const def = await db.query.reportDefinitions.findFirst({ where: eq(reportDefinitions.id, id) });
  if (!def) notFound();
  const [result, schedule] = await Promise.all([
    runReport(def.source, def.config as ReportConfig),
    db.query.reportSchedules.findFirst({ where: eq(reportSchedules.reportId, id) }),
  ]);
  const labels = Object.fromEntries((sourceMeta(def.source)?.fields ?? []).map((f) => [f.key, f.label]));
  const shown = result.rows.slice(0, MAX_SHOWN);

  return (
    <div className="max-w-5xl space-y-6">
      <Link href="/reports" className="text-sm text-neutral-500 hover:text-neutral-900">← Reports</Link>
      <PageHeader
        title={def.name}
        description={def.description || sourceMeta(def.source)?.label}
        action={
          <div className="flex flex-wrap gap-2">
            <a href={`/reports/${id}/export`} className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">Export CSV ↓</a>
            <Link href={`/reports/${id}/edit`} className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">Edit</Link>
            <form action={deleteReport}><input type="hidden" name="id" value={id} /><ConfirmButton message="Delete this report and its schedule?" className="rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">Delete</ConfirmButton></form>
          </div>
        }
      />

      <Card className="p-0">
        <div className="border-b border-neutral-100 px-4 py-2 text-xs text-neutral-400">{result.rows.length.toLocaleString()} row{result.rows.length === 1 ? "" : "s"}{result.rows.length > MAX_SHOWN ? ` (showing first ${MAX_SHOWN}; export CSV for all)` : ""}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-400"><tr>{result.columns.map((c) => <th key={c} className="px-3 py-2">{labels[c] ?? c}</th>)}</tr></thead>
            <tbody className="divide-y divide-neutral-100">
              {shown.map((r, i) => (
                <tr key={i} className="hover:bg-neutral-50">{result.columns.map((c) => <td key={c} className="px-3 py-1.5 text-neutral-700">{displayValue(r[c])}</td>)}</tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={result.columns.length} className="px-3 py-8 text-center text-neutral-400">No rows match this report.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-neutral-900">Scheduled email delivery</h2>
        <p className="mb-3 text-xs text-neutral-500">Send this report as a CSV to a list of recipients on a schedule.{schedule?.lastRunAt ? ` Last sent ${fmtDateTime(schedule.lastRunAt)}.` : ""}</p>
        <form action={saveSchedule} className="space-y-3">
          <input type="hidden" name="reportId" value={id} />
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col text-xs text-neutral-500">Frequency
              <select name="frequency" defaultValue={schedule?.frequency ?? "weekly"} className={`mt-1 ${input}`}>
                <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
              </select>
            </label>
            <label className="flex flex-col text-xs text-neutral-500">Day of week (weekly)
              <select name="dayOfWeek" defaultValue={String(schedule?.dayOfWeek ?? 1)} className={`mt-1 ${input}`}>
                {DOW.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </label>
            <label className="flex flex-col text-xs text-neutral-500">Day of month (monthly)
              <input name="dayOfMonth" type="number" min={1} max={28} defaultValue={schedule?.dayOfMonth ?? 1} className={`mt-1 w-24 ${input}`} />
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-700"><input type="checkbox" name="active" defaultChecked={schedule?.active ?? true} className="h-4 w-4" /> Active</label>
          </div>
          <label className="flex flex-col text-xs text-neutral-500">Recipients (comma or line separated)
            <textarea name="recipients" rows={2} defaultValue={(schedule?.recipients ?? []).join(", ")} placeholder="owner@g54.com, manager@g54.com" className={`mt-1 ${input}`} />
          </label>
          <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">{schedule ? "Update schedule" : "Schedule it"}</button>
        </form>
        {schedule && (
          <form action={deleteSchedule} className="mt-2">
            <input type="hidden" name="id" value={schedule.id} /><input type="hidden" name="reportId" value={id} />
            <button className="text-xs font-medium text-red-600 hover:text-red-800">Remove schedule</button>
          </form>
        )}
        <p className="mt-2 text-xs text-neutral-400">Delivery runs with the daily scheduler; emails send from the verified g54.com domain.</p>
      </Card>
    </div>
  );
}
