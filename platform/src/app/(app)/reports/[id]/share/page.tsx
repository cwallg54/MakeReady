import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reportDefinitions, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { ROLE_LABELS, ROLES } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { canManageSharing, listGrants } from "@/lib/reports/access";
import {
  grantReportAccessAction,
  revokeReportAccessAction,
  setReportVisibilityAction,
} from "@/lib/reports/access-actions";

export const dynamic = "force-dynamic";

/** Route params are strings, so a path like /reports/access reaches this page
 *  as an "id". Anything that is not a UUID is not a report — 404 rather than
 *  letting Postgres reject the cast and surface a 500. */
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

const inp = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand";

const VISIBILITY = [
  { value: "private", label: "Private", hint: "Only you (and administrators) can open it." },
  { value: "shared", label: "Shared with named people", hint: "Only the roles and people listed below." },
  { value: "everyone", label: "Everyone in Reports", hint: "Anyone who can open the Reports module." },
] as const;

export default async function ShareReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;

  if (!isUuid(id)) notFound();
  const def = await db.query.reportDefinitions.findFirst({ where: eq(reportDefinitions.id, id) });
  if (!def) notFound();
  if (!(await canManageSharing(user, def))) redirect("/403");

  const [grants, staff] = await Promise.all([
    listGrants({ reportId: id }),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.status, "active")).orderBy(users.name),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <Link href={`/reports/${id}`} className="text-sm text-neutral-500 hover:text-neutral-900">← {def.name}</Link>
      <PageHeader title="Who can see this report" description={def.name} />

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-neutral-900">Default visibility</h2>
        <p className="mb-3 text-xs text-neutral-500">
          This is what applies to anyone without an explicit grant below. You keep full access either way.
        </p>
        <form action={setReportVisibilityAction} className="space-y-2">
          <input type="hidden" name="reportId" value={id} />
          {VISIBILITY.map((v) => (
            <label key={v.value} className="flex items-start gap-3 rounded-lg border border-neutral-200 px-3 py-2">
              <input type="radio" name="visibility" value={v.value} defaultChecked={def.visibility === v.value} className="mt-1" />
              <span>
                <span className="block text-sm font-medium text-neutral-900">{v.label}</span>
                <span className="block text-xs text-neutral-500">{v.hint}</span>
              </span>
            </label>
          ))}
          <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Save visibility</button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-neutral-900">Specific access</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Give a role or one person read, write or delete on this report. Write lets them change what the report shows;
          delete lets them remove it entirely.
        </p>

        {grants.length === 0 ? (
          <p className="mb-4 rounded-md bg-neutral-50 px-3 py-3 text-center text-xs text-neutral-500">
            Nobody has been granted anything specific yet.
          </p>
        ) : (
          <table className="mb-4 w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                <th className="py-2 pr-3">Who</th>
                <th className="py-2 pr-3">Read</th>
                <th className="py-2 pr-3">Write</th>
                <th className="py-2 pr-3">Delete</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {grants.map((g) => (
                <tr key={g.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-3 text-neutral-900">
                    {g.role ? (
                      <>
                        <span className="font-medium">{ROLE_LABELS[g.role as keyof typeof ROLE_LABELS] ?? g.role}</span>
                        <span className="ml-1 text-xs text-neutral-400">role</span>
                      </>
                    ) : (
                      g.userName ?? "—"
                    )}
                  </td>
                  <td className="py-2 pr-3">{g.canView ? "✓" : "—"}</td>
                  <td className="py-2 pr-3">{g.canEdit ? "✓" : "—"}</td>
                  <td className="py-2 pr-3">{g.canDelete ? "✓" : "—"}</td>
                  <td className="py-2 text-right">
                    <form action={revokeReportAccessAction}>
                      <input type="hidden" name="grantId" value={g.id} />
                      <input type="hidden" name="reportId" value={id} />
                      <button className="text-xs text-neutral-400 hover:text-red-600">revoke</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <form action={grantReportAccessAction} className="flex flex-wrap items-end gap-3 border-t border-neutral-200 pt-4">
          <input type="hidden" name="reportId" value={id} />
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
            <label className="flex items-center gap-1"><input type="checkbox" name="canDelete" value="1" /> Delete</label>
          </div>
          <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Grant</button>
        </form>
        <p className="mt-2 text-xs text-neutral-500">
          Pick either a role or a person — whichever box the &ldquo;grant to&rdquo; choice does not use is ignored.
          Ticking nothing at all removes an existing grant.
        </p>
      </Card>
    </div>
  );
}
