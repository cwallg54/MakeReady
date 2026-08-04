import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requireModule } from "@/lib/auth/guards";
import { canEdit, isAdmin } from "@/lib/rbac";
import { db } from "@/db";
import { creditApprovalRequests, businessPartners, quotes, users } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { creditApprovalThreshold } from "@/lib/sales/credit";
import { approveCreditRequestAction, denyCreditRequestAction } from "@/lib/accounting/credit-actions";

export const dynamic = "force-dynamic";
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inp = "w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand";

export default async function CreditRequestsPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const user = await requireModule("accounting");
  const editable = canEdit(user.roles, "accounting");
  const admin = isAdmin(user.roles);
  const { err } = await searchParams;
  const threshold = await creditApprovalThreshold();

  const rows = await db
    .select({
      id: creditApprovalRequests.id, reason: creditApprovalRequests.reason, status: creditApprovalRequests.status,
      amount: creditApprovalRequests.amount, accountBalance: creditApprovalRequests.accountBalance, creditLimit: creditApprovalRequests.creditLimit,
      amountOver: creditApprovalRequests.amountOver, createdAt: creditApprovalRequests.createdAt, quoteId: creditApprovalRequests.quoteId,
      decidedAt: creditApprovalRequests.decidedAt, decisionNote: creditApprovalRequests.decisionNote,
      company: businessPartners.companyName, bpId: businessPartners.id, quoteNumber: quotes.quoteNumber, requestedByName: users.name,
    })
    .from(creditApprovalRequests)
    .leftJoin(businessPartners, eq(creditApprovalRequests.bpId, businessPartners.id))
    .leftJoin(quotes, eq(creditApprovalRequests.quoteId, quotes.id))
    .leftJoin(users, eq(creditApprovalRequests.requestedBy, users.id))
    .orderBy(desc(creditApprovalRequests.createdAt))
    .limit(100);
  const pending = rows.filter((r) => r.status === "pending");
  const decided = rows.filter((r) => r.status !== "pending");

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Credit requests" description="Over-limit and on-hold orders submitted by sales for finance sign-off." />

      {err === "tier" && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          That order is more than {money(threshold)} over the limit — it needs an Admin/manager to approve.
        </div>
      )}

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Pending ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-neutral-400">No requests waiting.</p>
        ) : (
          <div className="space-y-4">
            {pending.map((r) => {
              const over = Number(r.amountOver);
              const needsManager = r.reason === "over_limit" && over > threshold;
              return (
                <div key={r.id} className="rounded-lg border border-neutral-200 p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-semibold text-neutral-900">{r.bpId ? <Link href={`/reports/standard/credit/${r.bpId}`} className="text-brand-ink hover:underline">{r.company}</Link> : r.company ?? "—"}</span>
                      <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${r.reason === "hold" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{r.reason === "hold" ? "On credit hold" : `${money(over)} over limit`}</span>
                    </div>
                    <span className="text-xs text-neutral-400">{r.quoteNumber ? `Quote ${r.quoteNumber} · ` : ""}by {r.requestedByName ?? "—"} · {fmtDateTime(r.createdAt)}</span>
                  </div>
                  <dl className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <div><dt className="text-neutral-400">Order</dt><dd className="font-medium text-neutral-900">{money(Number(r.amount))}</dd></div>
                    <div><dt className="text-neutral-400">Balance</dt><dd className="text-neutral-700">{money(Number(r.accountBalance))}</dd></div>
                    <div><dt className="text-neutral-400">Credit limit</dt><dd className="text-neutral-700">{r.creditLimit != null ? money(Number(r.creditLimit)) : "—"}</dd></div>
                    <div><dt className="text-neutral-400">After this order</dt><dd className="text-neutral-700">{money(Number(r.accountBalance) + Number(r.amount))}</dd></div>
                  </dl>

                  {editable && needsManager && !admin && (
                    <p className="mb-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">More than {money(threshold)} over — requires an Admin/manager to approve. You can still decline.</p>
                  )}

                  {editable && (
                    <div className="flex flex-wrap items-end gap-2">
                      <form action={approveCreditRequestAction} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="id" value={r.id} />
                        <label className="text-xs text-neutral-500">New credit limit (optional)<input name="newLimit" type="number" step="0.01" min="0" placeholder={r.creditLimit != null ? String(Number(r.creditLimit)) : ""} className={`mt-1 w-32 ${inp}`} /></label>
                        {r.reason === "hold" && <label className="flex items-center gap-1 pb-1.5 text-xs text-neutral-600"><input type="checkbox" name="clearHold" className="h-4 w-4" /> clear hold</label>}
                        <label className="text-xs text-neutral-500">Note<input name="note" className={`mt-1 w-40 ${inp}`} /></label>
                        <button disabled={needsManager && !admin} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">Approve &amp; convert</button>
                      </form>
                      <form action={denyCreditRequestAction} className="flex items-end gap-2">
                        <input type="hidden" name="id" value={r.id} />
                        <input name="note" placeholder="reason" className={`w-32 ${inp}`} />
                        <button className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50">Decline</button>
                      </form>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {decided.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Recent decisions</h2>
          <ul className="space-y-1 text-sm">
            {decided.map((r) => (
              <li key={r.id} className="flex items-center justify-between">
                <span className="text-neutral-700">{r.company ?? "—"} · {r.reason === "hold" ? "hold" : `${money(Number(r.amountOver))} over`}</span>
                <span className={`text-xs font-semibold ${r.status === "approved" ? "text-emerald-700" : "text-red-700"}`}>{r.status}{r.decidedAt ? ` · ${fmtDateTime(r.decidedAt)}` : ""}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
