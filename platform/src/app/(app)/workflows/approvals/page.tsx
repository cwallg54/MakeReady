import Link from "next/link";
import { requireModule } from "@/lib/auth/guards";
import { isAdmin } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { approvalsForUser } from "@/lib/workflows/approvals";
import { decideApprovalAction } from "@/lib/workflows/actions";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";
const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default async function ApprovalsPage() {
  const user = await requireModule("workflows");
  const { pending, recent } = await approvalsForUser(user.roles);
  const canDecide = (role: string) => isAdmin(user.roles) || user.roles.includes(role as never);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Approvals inbox" description="Requests routed to your role — order/discount thresholds and workflow steps that need a sign-off." />
        <Link href="/workflows" className="text-sm text-neutral-500 hover:underline">← Workflows</Link>
      </div>

      <Card>
        <h2 className="text-sm font-semibold text-neutral-900">Pending ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">Nothing waiting on you. 🎉</p>
        ) : (
          <div className="mt-3 space-y-3">
            {pending.map((r) => (
              <div key={r.id} className="rounded-lg border border-neutral-200 p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-neutral-900">{r.title}</p>
                    <p className="text-xs text-neutral-400">{r.requestNumber} · {r.entityType}{r.amount ? ` · ${money(Number(r.amount))}` : ""} · {fmtDate(r.createdAt)}</p>
                  </div>
                </div>
                {canDecide(r.approverRole) ? (
                  <form action={decideApprovalAction} className="mt-2 flex items-center gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <input name="note" placeholder="Note (optional)" className="flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
                    <button name="decision" value="approve" className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700">Approve</button>
                    <button name="decision" value="reject" className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Reject</button>
                  </form>
                ) : (
                  <p className="mt-2 text-xs text-neutral-400">Awaiting {r.approverRole.replace("_", " ")}.</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-neutral-900">Recently decided</h2>
        {recent.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">No decisions yet.</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <tbody className="divide-y divide-neutral-100">
              {recent.map((r) => (
                <tr key={r.id}>
                  <td className="py-1.5 text-neutral-700">{r.title}</td>
                  <td className="py-1.5"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.status === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{r.status}</span></td>
                  <td className="py-1.5 text-right text-neutral-400">{r.decidedAt ? fmtDate(r.decidedAt) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
