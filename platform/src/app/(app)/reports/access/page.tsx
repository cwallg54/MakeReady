import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { reportDefinitions, reportGrants, reportSettings, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { isAdmin, ROLE_LABELS, ROLES } from "@/lib/rbac";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { STANDARD_REPORTS } from "@/lib/reports/standard";
import {
  grantReportAccessAction,
  revokeReportAccessAction,
  setReportRestrictedAction,
} from "@/lib/reports/access-actions";

export const dynamic = "force-dynamic";
const inp = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand";

const VIS_LABEL: Record<string, string> = {
  private: "Private to its owner",
  shared: "Only named people",
  everyone: "Everyone in Reports",
};

export default async function ReportAccessPage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user.roles)) redirect("/403");
  const sp = await searchParams;

  const [saved, settings, allGrants, staff] = await Promise.all([
    db
      .select({
        id: reportDefinitions.id,
        name: reportDefinitions.name,
        visibility: reportDefinitions.visibility,
        owner: users.name,
      })
      .from(reportDefinitions)
      .leftJoin(users, eq(users.id, reportDefinitions.createdBy))
      .orderBy(asc(reportDefinitions.name)),
    db.select({ reportKey: reportSettings.reportKey, restricted: reportSettings.restricted }).from(reportSettings),
    db
      .select({
        id: reportGrants.id,
        reportId: reportGrants.reportId,
        reportKey: reportGrants.reportKey,
        role: reportGrants.role,
        userId: reportGrants.userId,
        userName: users.name,
        canView: reportGrants.canView,
        canEdit: reportGrants.canEdit,
        canDelete: reportGrants.canDelete,
      })
      .from(reportGrants)
      .leftJoin(users, eq(users.id, reportGrants.userId)),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.status, "active")).orderBy(users.name),
  ]);

  const restrictedBy = new Map(settings.map((s) => [s.reportKey, s.restricted]));
  const grantsFor = (pred: (g: (typeof allGrants)[number]) => boolean) => allGrants.filter(pred);
  const selectedKey = sp.key && STANDARD_REPORTS.some((r) => r.slug === sp.key) ? sp.key : null;

  const describe = (g: (typeof allGrants)[number]) => {
    const who = g.role ? ROLE_LABELS[g.role as keyof typeof ROLE_LABELS] ?? g.role : g.userName ?? "—";
    const perms = [g.canView && "read", g.canEdit && "write", g.canDelete && "delete"].filter(Boolean).join(", ");
    return `${who} (${perms})`;
  };

  const restrictedCount = STANDARD_REPORTS.filter((r) => restrictedBy.get(r.slug)).length;

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <Link href="/reports" className="text-neutral-500 hover:text-neutral-900">← Reports</Link>
      </div>
      <PageHeader
        title="Report access"
        description="Who can read, change and delete each report. Built-in reports follow the module rules until you restrict one; saved reports follow their own visibility."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Built-in reports" value={String(STANDARD_REPORTS.length)} />
        <StatCard label="Restricted" value={String(restrictedCount)} />
        <StatCard label="Saved reports" value={String(saved.length)} />
      </div>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-neutral-900">Built-in reports</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Restricting one hides it from everybody except administrators and whoever you grant it to.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                <th className="py-2 pr-3">Report</th>
                <th className="py-2 pr-3">Who can see it</th>
                <th className="py-2 pr-3">Specific grants</th>
                <th className="py-2 text-right">Manage</th>
              </tr>
            </thead>
            <tbody>
              {STANDARD_REPORTS.map((r) => {
                const restricted = !!restrictedBy.get(r.slug);
                const grants = grantsFor((g) => g.reportKey === r.slug);
                return (
                  <tr key={r.slug} className="border-b border-neutral-100">
                    <td className="py-2 pr-3">
                      <Link href={`/reports/standard/${r.slug}`} className="font-medium text-neutral-900 hover:text-brand">{r.name}</Link>
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`rounded border px-2 py-0.5 text-xs ${restricted ? "border-amber-200 bg-amber-50 text-amber-700" : "border-neutral-200 bg-neutral-50 text-neutral-600"}`}>
                        {restricted ? "Restricted" : "Anyone in Reports"}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs text-neutral-600">
                      {grants.length === 0 ? <span className="text-neutral-400">none</span> : grants.map(describe).join(" · ")}
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <form action={setReportRestrictedAction}>
                          <input type="hidden" name="reportKey" value={r.slug} />
                          <input type="hidden" name="restricted" value={restricted ? "0" : "1"} />
                          <button className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:border-neutral-400">
                            {restricted ? "Open up" : "Restrict"}
                          </button>
                        </form>
                        <Link
                          href={`/reports/access?key=${r.slug}`}
                          className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:border-neutral-400"
                        >
                          Grant
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {selectedKey && (
          <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
            <h3 className="mb-2 text-sm font-semibold text-neutral-900">
              Grant access to {STANDARD_REPORTS.find((r) => r.slug === selectedKey)?.name}
            </h3>
            <form action={grantReportAccessAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="reportKey" value={selectedKey} />
              <label>
                <span className="mb-1 block text-xs font-medium text-neutral-600">Grant to</span>
                <select name="granteeType" className={inp} defaultValue="role">
                  <option value="role">A role</option>
                  <option value="user">One person</option>
                </select>
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-neutral-600">Role</span>
                <select name="role" className={inp}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-neutral-600">Person</span>
                <select name="granteeUserId" className={inp} defaultValue="">
                  <option value="">—</option>
                  {staff.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-3 pb-2 text-xs text-neutral-700">
                <label className="flex items-center gap-1"><input type="checkbox" name="canView" value="1" defaultChecked /> Read</label>
                <label className="flex items-center gap-1"><input type="checkbox" name="canEdit" value="1" /> Write</label>
              </div>
              <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Grant</button>
              <Link href="/reports/access" className="pb-2 text-xs text-neutral-500 hover:text-neutral-900">cancel</Link>
            </form>

            {grantsFor((g) => g.reportKey === selectedKey).length > 0 && (
              <ul className="mt-3 space-y-1 text-xs">
                {grantsFor((g) => g.reportKey === selectedKey).map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-3">
                    <span className="text-neutral-700">{describe(g)}</span>
                    <form action={revokeReportAccessAction}>
                      <input type="hidden" name="grantId" value={g.id} />
                      <button className="text-neutral-400 hover:text-red-600">revoke</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-neutral-900">Saved reports</h2>
        <p className="mb-3 text-xs text-neutral-500">Each one is shared by its owner; you can open any of them.</p>
        {saved.length === 0 ? (
          <p className="rounded-md bg-neutral-50 px-3 py-4 text-center text-xs text-neutral-500">Nobody has built a report yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                <th className="py-2 pr-3">Report</th>
                <th className="py-2 pr-3">Owner</th>
                <th className="py-2 pr-3">Default visibility</th>
                <th className="py-2 pr-3">Specific grants</th>
                <th className="py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {saved.map((r) => {
                const grants = grantsFor((g) => g.reportId === r.id);
                return (
                  <tr key={r.id} className="border-b border-neutral-100">
                    <td className="py-2 pr-3">
                      <Link href={`/reports/${r.id}`} className="font-medium text-neutral-900 hover:text-brand">{r.name}</Link>
                    </td>
                    <td className="py-2 pr-3 text-neutral-600">{r.owner ?? "—"}</td>
                    <td className="py-2 pr-3 text-xs text-neutral-600">{VIS_LABEL[r.visibility]}</td>
                    <td className="py-2 pr-3 text-xs text-neutral-600">
                      {grants.length === 0 ? <span className="text-neutral-400">none</span> : grants.map(describe).join(" · ")}
                    </td>
                    <td className="py-2 text-right">
                      <Link href={`/reports/${r.id}/share`} className="text-xs text-neutral-500 hover:text-neutral-900">manage →</Link>
                    </td>
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
