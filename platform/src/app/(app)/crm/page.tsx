import Link from "next/link";
import { and, asc, ilike, eq, type SQL } from "drizzle-orm";
import { requireModule } from "@/lib/auth/guards";
import { canEdit, crmScopedToOwn } from "@/lib/rbac";
import { db } from "@/db";
import { businessPartners, accountGroups, users } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";

const WEB_STORE_LABEL: Record<string, string> = {
  not_published: "Not published",
  pending: "Pending",
  published: "Published",
};
const STAGE_LABEL: Record<string, string> = { lead: "Lead", prospect: "Prospect", customer: "Customer" };
const STAGE_BADGE: Record<string, string> = {
  lead: "bg-amber-100 text-amber-700",
  prospect: "bg-blue-100 text-blue-700",
  customer: "bg-emerald-100 text-emerald-700",
};
const STAGE_FILTERS = [
  { key: "", label: "All" },
  { key: "lead", label: "Leads" },
  { key: "prospect", label: "Prospects" },
  { key: "customer", label: "Customers" },
];

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stage?: string; mine?: string }>;
}) {
  const user = await requireModule("crm");
  const { q, stage, mine } = await searchParams;
  const editable = canEdit(user.roles, "crm");
  const scoped = crmScopedToOwn(user.roles);

  const conditions: SQL[] = [];
  if (q) conditions.push(ilike(businessPartners.companyName, `%${q}%`));
  if (stage && ["lead", "prospect", "customer"].includes(stage)) {
    conditions.push(eq(businessPartners.lifecycleStage, stage as "lead" | "prospect" | "customer"));
  }
  // Sales Reps are always scoped to their own accounts; others can opt in via "mine".
  if (scoped || mine === "1") conditions.push(eq(businessPartners.ownerId, user.id));

  const rows = await db
    .select({
      id: businessPartners.id,
      bpNumber: businessPartners.bpNumber,
      companyName: businessPartners.companyName,
      lifecycleStage: businessPartners.lifecycleStage,
      tags: businessPartners.tags,
      city: businessPartners.addressCity,
      state: businessPartners.addressState,
      webStoreStatus: businessPartners.webStoreStatus,
      groupName: accountGroups.name,
      ownerName: users.name,
    })
    .from(businessPartners)
    .leftJoin(accountGroups, eq(businessPartners.accountGroupId, accountGroups.id))
    .leftJoin(users, eq(businessPartners.ownerId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(businessPartners.companyName))
    .limit(300);

  const qp = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (stage) p.set("stage", stage);
    if (mine === "1") p.set("mine", "1");
    for (const [k, v] of Object.entries(extra)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const s = p.toString();
    return `/crm${s ? `?${s}` : ""}`;
  };

  return (
    <div>
      <PageHeader
        title="CRM — Business Partners"
        description="Customer accounts, leads, and prospects. The anchor for quotes, orders, invoices, and Web Store access."
        action={
          <div className="flex gap-2">
            <Link href="/crm/pipeline" className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">
              Pipeline
            </Link>
            {editable && (
              <Link href="/crm/new" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">
                New Business Partner
              </Link>
            )}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {STAGE_FILTERS.map((f) => {
          const active = (stage ?? "") === f.key;
          return (
            <Link
              key={f.key}
              href={qp({ stage: f.key })}
              className={`rounded-full px-3 py-1 text-sm font-medium ${active ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}
            >
              {f.label}
            </Link>
          );
        })}
        {!scoped && (
          <Link
            href={mine === "1" ? qp({ mine: "" }) : qp({ mine: "1" })}
            className={`ml-2 rounded-full px-3 py-1 text-sm font-medium ${mine === "1" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}
          >
            My accounts
          </Link>
        )}
      </div>

      <form className="mb-4" action="/crm">
        {stage && <input type="hidden" name="stage" value={stage} />}
        {mine === "1" && <input type="hidden" name="mine" value="1" />}
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by company name…"
          className="w-full max-w-md rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-neutral-500"
        />
      </form>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-5 py-2 font-medium">BP #</th>
                <th className="px-5 py-2 font-medium">Company</th>
                <th className="px-5 py-2 font-medium">Stage</th>
                <th className="px-5 py-2 font-medium">Owner</th>
                <th className="px-5 py-2 font-medium">Account group</th>
                <th className="px-5 py-2 font-medium">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-neutral-400">
                    {q || stage || mine ? "No matching business partners." : "No business partners yet. Create one to get started."}
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-neutral-50">
                  <td className="px-5 py-3 font-mono text-xs text-neutral-500">{r.bpNumber}</td>
                  <td className="px-5 py-3">
                    <Link href={`/crm/${r.id}`} className="font-medium text-neutral-900 hover:underline">
                      {r.companyName}
                    </Link>
                    {r.tags && r.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {r.tags.map((t) => (
                          <span key={t} className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600">{t}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STAGE_BADGE[r.lifecycleStage]}`}>
                      {STAGE_LABEL[r.lifecycleStage]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-neutral-600">{r.ownerName ?? "Unassigned"}</td>
                  <td className="px-5 py-3 text-neutral-600">{r.groupName ?? "—"}</td>
                  <td className="px-5 py-3 text-neutral-600">{[r.city, r.state].filter(Boolean).join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
