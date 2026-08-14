import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { recurringJournals } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { createRecurringAction } from "@/lib/accounting/recurring-actions";

export const dynamic = "force-dynamic";
const ORD = ["th", "st", "nd", "rd"];
const ordinal = (n: number) => `${n}${ORD[(n % 100 - 20) % 10] || ORD[n % 100] || ORD[0]}`;

export default async function RecurringListPage() {
  const user = await requireModule("accounting");
  const canDo = canEdit(user.roles, "accounting");
  const rows = await db.select().from(recurringJournals).orderBy(asc(recurringJournals.name));

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between">
        <PageHeader title="Recurring journal entries" description="Templates that auto-post the same entry each month — rent, insurance, recurring accruals." />
        {canDo && <form action={createRecurringAction}><button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">New recurring entry</button></form>}
      </div>
      <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-400">
            <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Posts on</th><th className="px-3 py-2">Last posted</th><th className="px-3 py-2">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-neutral-400">No recurring entries yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-neutral-50">
                <td className="px-3 py-2"><Link href={`/accounting/recurring/${r.id}`} className="font-medium text-neutral-900 hover:underline">{r.name}</Link></td>
                <td className="px-3 py-2 text-neutral-600">{ordinal(r.dayOfMonth)} of the month</td>
                <td className="px-3 py-2 text-neutral-500">{r.lastPostedYm ?? "—"}</td>
                <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.active ? "bg-emerald-100 text-emerald-700" : "bg-neutral-200 text-neutral-600"}`}>{r.active ? "active" : "paused"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
