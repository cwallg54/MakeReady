import Link from "next/link";
import { and, asc, ilike, eq, type SQL } from "drizzle-orm";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { db } from "@/db";
import { businessPartners, accountGroups } from "@/db/schema";
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
  searchParams: Promise<{ q?: string; stage?: string }>;
}) {
  const user = await requireModule("crm");
  const { q, stage } = await searchParams;
  const editable = canEdit(user.roles, "crm");

  const conditions: SQL[] = [];
  if (q) conditions.push(ilike(businessPartners.companyName, `%${q}%`));
  if (stage && ["lead", "prospect", "customer"].includes(stage)) {
    conditions.push(eq(businessPartners.lifecycleStage, stage as "lead" | "prospect" | "customer"));
  }

  const rows = await db
    .select({
      id: businessPartners.id,
      bpNumber: businessPartners.bpNumber,
      companyName: businessPartners.companyName,
      lifecycleStage: businessPartners.lifecycleStage,
      city: businessPartners.addressCity,
      state: businessPartners.addressState,
      webStoreStatus: businessPartners.webStoreStatus,
      groupName: accountGroups.name,
    })
    .from(businessPartners)
    .leftJoin(accountGroups, eq(businessPartners.accountGroupId, accountGroups.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(businessPartners.companyName))
    .limit(200);

  return (
    <div>
      <PageHeader
        title="CRM — Business Partners"
        description="Customer accounts. Each is the anchor for quotes, orders, invoices, and Web Store access."
        action={
          editable ? (
            <Link href="/crm/new" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">
              New Business Partner
            </Link>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {STAGE_FILTERS.map((f) => {
          const active = (stage ?? "") === f.key;
          const params = new URLSearchParams();
          if (f.key) params.set("stage", f.key);
          if (q) params.set("q", q);
          const href = `/crm${params.toString() ? `?${params}` : ""}`;
          return (
            <Link
              key={f.key}
              href={href}
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                active ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      <form className="mb-4" action="/crm">
        {stage && <input type="hidden" name="stage" value={stage} />}
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
                <th className="px-5 py-2 font-medium">Account group</th>
                <th className="px-5 py-2 font-medium">Location</th>
                <th className="px-5 py-2 font-medium">Web Store</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-neutral-400">
                    {q || stage ? "No matching business partners." : "No business partners yet. Create one to get started."}
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
                  </td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STAGE_BADGE[r.lifecycleStage]}`}>
                      {STAGE_LABEL[r.lifecycleStage]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-neutral-600">{r.groupName ?? "—"}</td>
                  <td className="px-5 py-3 text-neutral-600">
                    {[r.city, r.state].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-5 py-3 text-neutral-600">{WEB_STORE_LABEL[r.webStoreStatus]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
