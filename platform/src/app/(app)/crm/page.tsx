import Link from "next/link";
import { and, or, asc, desc, ilike, eq, type SQL, type SQLWrapper } from "drizzle-orm";
import { requireModule } from "@/lib/auth/guards";
import { canEdit, crmScopedToOwn } from "@/lib/rbac";
import { db } from "@/db";
import { businessPartners, accountGroups, users } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";

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

// Sortable columns → the DB expression they sort on.
const SORT_COLS = {
  bp: businessPartners.bpNumber,
  company: businessPartners.companyName,
  stage: businessPartners.lifecycleStage,
  owner: users.name,
  group: accountGroups.name,
  location: businessPartners.addressCity,
} as const;
type SortKey = keyof typeof SORT_COLS;

const inp = "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-neutral-500";

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stage?: string; mine?: string; owner?: string; group?: string; loc?: string; sort?: string; dir?: string }>;
}) {
  const user = await requireModule("crm");
  const { q, stage, mine, owner, group, loc, sort: sortParam, dir: dirParam } = await searchParams;
  const editable = canEdit(user.roles, "crm");
  const scoped = crmScopedToOwn(user.roles);

  const sort: SortKey = (Object.keys(SORT_COLS) as SortKey[]).includes(sortParam as SortKey) ? (sortParam as SortKey) : "company";
  const dir = dirParam === "desc" ? "desc" : "asc";

  const conditions: SQL[] = [];
  if (q) conditions.push(ilike(businessPartners.companyName, `%${q}%`));
  if (stage && ["lead", "prospect", "customer"].includes(stage)) {
    conditions.push(eq(businessPartners.lifecycleStage, stage as "lead" | "prospect" | "customer"));
  }
  if (owner) conditions.push(eq(businessPartners.ownerId, owner));
  if (group) conditions.push(eq(businessPartners.accountGroupId, group));
  if (loc) {
    conditions.push(or(ilike(businessPartners.addressCity, `%${loc}%`), ilike(businessPartners.addressState, `%${loc}%`)) as SQL);
  }
  // Sales Reps are always scoped to their own accounts; others can opt in via "mine".
  if (scoped || mine === "1") conditions.push(eq(businessPartners.ownerId, user.id));

  const dirFn = dir === "desc" ? desc : asc;
  const sortCol = SORT_COLS[sort] as SQLWrapper;

  const rows = await db
    .select({
      id: businessPartners.id,
      bpNumber: businessPartners.bpNumber,
      companyName: businessPartners.companyName,
      lifecycleStage: businessPartners.lifecycleStage,
      tags: businessPartners.tags,
      city: businessPartners.addressCity,
      state: businessPartners.addressState,
      groupName: accountGroups.name,
      ownerName: users.name,
    })
    .from(businessPartners)
    .leftJoin(accountGroups, eq(businessPartners.accountGroupId, accountGroups.id))
    .leftJoin(users, eq(businessPartners.ownerId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(dirFn(sortCol), asc(businessPartners.companyName))
    .limit(300);

  // Filter option lists.
  const [groups, owners] = await Promise.all([
    db.select({ id: accountGroups.id, name: accountGroups.name }).from(accountGroups).orderBy(asc(accountGroups.name)),
    scoped
      ? Promise.resolve([] as { id: string; name: string }[])
      : db.selectDistinct({ id: users.id, name: users.name }).from(businessPartners).innerJoin(users, eq(businessPartners.ownerId, users.id)).orderBy(asc(users.name)),
  ]);

  const current = { q, stage, mine, owner, group, loc, sort, dir };
  const qp = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(current)) if (v) p.set(k, String(v));
    for (const [k, v] of Object.entries(extra)) { if (v) p.set(k, v); else p.delete(k); }
    const s = p.toString();
    return `/crm${s ? `?${s}` : ""}`;
  };

  // Sortable column header: toggles asc/desc, shows the active arrow.
  const Th = ({ col, label, className = "" }: { col: SortKey; label: string; className?: string }) => {
    const activeCol = sort === col;
    const nextDir = activeCol && dir === "asc" ? "desc" : "asc";
    const arrow = activeCol ? (dir === "asc" ? "▲" : "▼") : "↕";
    return (
      <th className={`px-5 py-2 font-medium ${className}`}>
        <Link href={qp({ sort: col, dir: nextDir })} className={`inline-flex items-center gap-1 hover:text-neutral-800 ${activeCol ? "text-neutral-900" : ""}`}>
          {label}
          <span className={activeCol ? "text-neutral-500" : "text-neutral-300"}>{arrow}</span>
        </Link>
      </th>
    );
  };

  const hasFilters = !!(q || stage || mine || owner || group || loc);

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

      {/* Filter bar — preserves stage/mine/sort via hidden fields. */}
      <form className="mb-4 flex flex-wrap items-end gap-2" action="/crm">
        {stage && <input type="hidden" name="stage" value={stage} />}
        {mine === "1" && <input type="hidden" name="mine" value="1" />}
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="dir" value={dir} />
        <input name="q" defaultValue={q ?? ""} placeholder="Search company…" className={`${inp} w-full sm:w-56`} />
        {!scoped && (
          <select name="owner" defaultValue={owner ?? ""} className={inp}>
            <option value="">All owners</option>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
        <select name="group" defaultValue={group ?? ""} className={inp}>
          <option value="">All account groups</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <input name="loc" defaultValue={loc ?? ""} placeholder="City or state…" className={`${inp} w-full sm:w-40`} />
        <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Apply</button>
        {hasFilters && (
          <Link href="/crm" className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-600 hover:bg-neutral-50">Clear</Link>
        )}
      </form>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <Th col="bp" label="BP #" />
                <Th col="company" label="Company" />
                <Th col="stage" label="Stage" />
                <Th col="owner" label="Owner" />
                <Th col="group" label="Account group" />
                <Th col="location" label="Location" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-neutral-400">
                    {hasFilters ? "No matching business partners." : "No business partners yet. Create one to get started."}
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
        {rows.length >= 300 && (
          <div className="border-t border-neutral-100 px-5 py-2 text-center text-xs text-neutral-400">Showing the first 300 matches — narrow with filters above.</div>
        )}
      </Card>
    </div>
  );
}
