import Link from "next/link";
import { requireModule } from "@/lib/auth/guards";
import { crmScopedToOwn } from "@/lib/rbac";
import { reorderCandidates } from "@/lib/crm/reorders";
import { PageHeader } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { ReorderOutreach } from "./reorder-outreach";

export const dynamic = "force-dynamic";
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

export default async function ReordersPage() {
  const user = await requireModule("crm");
  let candidates = await reorderCandidates({ limit: 150 });
  // Sales reps only see their own book.
  if (crmScopedToOwn(user.roles)) candidates = candidates.filter((c) => c.ownerId === user.id);

  const atRisk = candidates.reduce((s, c) => s + c.lifetime, 0);

  return (
    <div className="max-w-6xl">
      <PageHeader title="Reorder radar" description="Accounts overdue for their next order, ranked by how overdue and how valuable — reach out before they drift." />

      <div className="mb-4 flex flex-wrap gap-2">
        <span className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-600"><span className="font-medium text-neutral-900">{candidates.length}</span> account{candidates.length === 1 ? "" : "s"} due</span>
        <span className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-600"><span className="font-medium text-neutral-900">{money(atRisk)}</span> lifetime value in play</span>
      </div>

      {candidates.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          No accounts are overdue for a reorder right now. Nicely done.
        </div>
      ) : (
        <div className="space-y-2">
          {candidates.map((c) => {
            const pctLate = Math.round((c.overdueRatio - 1) * 100);
            return (
              <div key={c.bpId} className="rounded-xl border border-neutral-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link href={`/crm/${c.bpId}`} className="text-sm font-semibold text-neutral-900 hover:underline">{c.company}</Link>
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">{pctLate}% overdue</span>
                    </div>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      Last order {fmtDate(c.lastOrder)} · reorders ~every {Math.round(c.avgIntervalDays)} days · {c.orders} orders · {money(c.lifetime)} lifetime
                      {c.ownerName ? ` · ${c.ownerName}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-400">Expected reorder was {fmtDate(c.expectedNext)} — {Math.round(c.daysOverdue)} days ago</p>
                    <ReorderOutreach bpId={c.bpId} email={c.email} />
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Link href={`/sales/quotes/new?bp=${c.bpId}&bpName=${encodeURIComponent(c.company)}`} className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-700">New quote →</Link>
                    {c.phone && <a href={`tel:${c.phone}`} className="text-xs font-medium text-neutral-500 hover:text-neutral-900">{c.phone}</a>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
