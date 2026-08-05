import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { db } from "@/db";
import { storeCustomers } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { setCustomerStatusAction } from "@/lib/store/actions";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";
const BADGE: Record<string, string> = { pending: "bg-amber-100 text-amber-700", active: "bg-emerald-100 text-emerald-700", suspended: "bg-neutral-200 text-neutral-600", rejected: "bg-red-100 text-red-700" };

export default async function StoreCustomersPage() {
  const user = await requireModule("web_store");
  if (!canEdit(user.roles, "web_store")) redirect("/web-store");

  // Pending first, then most recent.
  const rows = await db.select().from(storeCustomers)
    .orderBy(sql`case ${storeCustomers.status} when 'pending' then 0 else 1 end`, desc(storeCustomers.createdAt)).limit(200);
  const pending = rows.filter((r) => r.status === "pending").length;

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/web-store" className="text-sm text-neutral-500 hover:text-neutral-900">← Web Store</Link>
      <PageHeader title="Store customers" description={`Business Partner store logins.${pending ? ` ${pending} awaiting approval.` : ""}`} />

      <Card className="p-0">
        <ul className="divide-y divide-neutral-100">
          {rows.length === 0 && <li className="px-4 py-6 text-center text-sm text-neutral-400">No store customers yet.</li>}
          {rows.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-neutral-900">{c.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${BADGE[c.status]}`}>{c.status}</span>
                </div>
                <div className="text-xs text-neutral-500">{c.email}{c.companyName ? ` · ${c.companyName}` : ""}{c.phone ? ` · ${c.phone}` : ""} · joined {fmtDate(c.createdAt)}</div>
              </div>
              <div className="flex shrink-0 gap-2">
                {c.status === "pending" && (
                  <>
                    <form action={setCustomerStatusAction}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="status" value="active" /><button className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-700">Approve</button></form>
                    <form action={setCustomerStatusAction}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="status" value="rejected" /><button className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50">Reject</button></form>
                  </>
                )}
                {c.status === "active" && (
                  <form action={setCustomerStatusAction}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="status" value="suspended" /><button className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50">Suspend</button></form>
                )}
                {(c.status === "suspended" || c.status === "rejected") && (
                  <form action={setCustomerStatusAction}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="status" value="active" /><button className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-700">Activate</button></form>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
