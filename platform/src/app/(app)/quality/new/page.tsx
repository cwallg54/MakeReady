import Link from "next/link";
import { redirect } from "next/navigation";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { jobsForInspection } from "@/lib/quality/data";
import { createInspectionAction } from "@/lib/quality/actions";

export const dynamic = "force-dynamic";
const input = "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";
const label = "block text-xs font-medium uppercase tracking-wide text-neutral-500";

export default async function NewInspectionPage({ searchParams }: { searchParams: Promise<{ jobId?: string }> }) {
  const user = await requireModule("quality");
  if (!canEdit(user.roles, "quality")) redirect("/403");
  const { jobId } = await searchParams;
  const jobs = await jobsForInspection();

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="New QC inspection" description="Record an inspection result and any defects found." />
      <Card>
        <form action={createInspectionAction} className="space-y-4">
          <div>
            <label className={label}>Production job</label>
            <select name="jobId" defaultValue={jobId ?? ""} className={input}>
              <option value="">— None / standalone —</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.orderNumber ?? j.id.slice(0, 8)} · {j.customer ?? ""} ({j.status.replace(/_/g, " ")})</option>)}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Stage</label>
              <select name="stage" defaultValue="final" className={input}><option value="incoming">Incoming (blanks)</option><option value="in_process">In-process</option><option value="final">Final</option></select>
            </div>
            <div>
              <label className={label}>Result</label>
              <select name="result" defaultValue="pass" className={input}><option value="pass">Pass</option><option value="conditional">Conditional</option><option value="fail">Fail</option></select>
            </div>
            <div><label className={label}>Qty inspected</label><input name="qtyInspected" type="number" min={0} className={input} /></div>
            <div><label className={label}>Qty rejected</label><input name="qtyRejected" type="number" min={0} className={input} /></div>
          </div>
          <div><label className={label}>Notes</label><textarea name="notes" rows={2} className={input} /></div>
          <div className="flex justify-end gap-2">
            <Link href="/quality" className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Cancel</Link>
            <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Create inspection</button>
          </div>
        </form>
      </Card>
    </div>
  );
}
