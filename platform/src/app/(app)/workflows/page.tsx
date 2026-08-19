import Link from "next/link";
import { requireModule } from "@/lib/auth/guards";
import { isAdmin } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { WORKFLOWS, recentRuns } from "@/lib/workflows/engine";
import { runWorkflowAction } from "@/lib/workflows/actions";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";
const input = "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";
const label = "block text-xs font-medium uppercase tracking-wide text-neutral-500";

export default async function WorkflowsPage() {
  const user = await requireModule("workflows");
  const runs = await recentRuns();

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Workflows & approvals" description="Run multi-step actions in one click, and manage the approval requests those steps (and pricing/order rules) raise." />
        <div className="flex gap-2">
          <Link href="/workflows/approvals" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Approvals inbox</Link>
          {isAdmin(user.roles) && <Link href="/workflows/rules" className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Approval rules</Link>}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">One-click workflows</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {WORKFLOWS.map((w) => (
            <Card key={w.key}>
              <h3 className="text-sm font-semibold text-neutral-900">{w.label}</h3>
              <p className="mt-1 text-xs text-neutral-500">{w.description}</p>
              <form action={runWorkflowAction} className="mt-3 space-y-2">
                <input type="hidden" name="workflowKey" value={w.key} />
                {w.fields.map((f) => (
                  <div key={f.name}>
                    <label className={label}>{f.label}</label>
                    <input name={f.name} type={f.type === "email" ? "email" : "text"} required={f.required} placeholder={f.placeholder} className={input} />
                  </div>
                ))}
                <div className="flex justify-end pt-1"><button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Run workflow</button></div>
              </form>
            </Card>
          ))}
        </div>
      </div>

      <Card>
        <h2 className="text-sm font-semibold text-neutral-900">Recent runs</h2>
        {runs.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">No workflow runs yet.</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <tbody className="divide-y divide-neutral-100">
              {runs.map((r) => {
                const steps = (r.steps as { name: string; ok: boolean }[] | null) ?? [];
                return (
                  <tr key={r.id}>
                    <td className="py-1.5 text-neutral-700">{r.label}</td>
                    <td className="py-1.5 text-neutral-500">{steps.filter((s) => s.ok).length}/{steps.length} steps</td>
                    <td className="py-1.5"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{r.status}</span></td>
                    <td className="py-1.5 text-right text-neutral-400">{fmtDate(r.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
