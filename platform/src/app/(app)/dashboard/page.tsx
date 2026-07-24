import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { canView, crmScopedToOwn, ROLE_LABELS } from "@/lib/rbac";
import { PageHeader, StatCard, Card } from "@/components/ui";
import { db } from "@/db";
import { users, auditLog, businessPartners, crmTasks } from "@/db/schema";
import { and, asc, count, eq, gte } from "drizzle-orm";

export default async function DashboardPage() {
  const user = await requireUser();

  // Real foundation metrics (Admin sees the live platform state).
  const showAdminStats = user.roles.includes("admin");
  let userCount = 0;
  let eventsToday = 0;
  if (showAdminStats) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [u] = await db.select({ n: count() }).from(users);
    const [e] = await db
      .select({ n: count() })
      .from(auditLog)
      .where(gte(auditLog.createdAt, startOfDay));
    userCount = u.n;
    eventsToday = e.n;
  }

  // CRM widgets
  const showCrm = canView(user.roles, "crm");
  const scoped = crmScopedToOwn(user.roles);
  let stageCounts: { stage: string; n: number }[] = [];
  let myTasks: { id: string; title: string; dueDate: Date | null; company: string; bpId: string }[] = [];
  if (showCrm) {
    stageCounts = await db
      .select({ stage: businessPartners.lifecycleStage, n: count() })
      .from(businessPartners)
      .where(scoped ? eq(businessPartners.ownerId, user.id) : undefined)
      .groupBy(businessPartners.lifecycleStage);
    myTasks = await db
      .select({ id: crmTasks.id, title: crmTasks.title, dueDate: crmTasks.dueDate, company: businessPartners.companyName, bpId: crmTasks.bpId })
      .from(crmTasks)
      .innerJoin(businessPartners, eq(crmTasks.bpId, businessPartners.id))
      .where(and(eq(crmTasks.assignedToId, user.id), eq(crmTasks.status, "open")))
      .orderBy(asc(crmTasks.dueDate))
      .limit(8);
  }
  const stageCount = (s: string) => stageCounts.find((r) => r.stage === s)?.n ?? 0;

  const firstName = user.name.split(" ")[0];

  return (
    <div>
      <PageHeader
        title={`Welcome, ${firstName}`}
        description={`Signed in as ${user.roles.map((r) => ROLE_LABELS[r]).join(", ")}.`}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {showAdminStats && (
          <>
            <StatCard label="Users" value={userCount} hint="Active + inactive accounts" />
            <StatCard label="Audit events today" value={eventsToday} hint="Since midnight" />
          </>
        )}
        {canView(user.roles, "sales") && (
          <StatCard label="Open sales orders" value="—" hint="Available when Sales ships (Phase 2)" />
        )}
        {canView(user.roles, "jobs") && (
          <StatCard label="Jobs in production" value="—" hint="Available when Production ships (Phase 4)" />
        )}
        {canView(user.roles, "accounting") && (
          <StatCard label="AR outstanding" value="—" hint="Available when Finance ships (Phase 5)" />
        )}
        {canView(user.roles, "content_library") && (
          <StatCard label="Library assets" value="—" hint="Available when Content Library ships (Phase 6)" />
        )}
      </div>

      {showCrm && (
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <h2 className="mb-3 text-sm font-semibold text-neutral-900">Pipeline</h2>
            <div className="space-y-2">
              {[
                { key: "lead", label: "Leads", cls: "text-amber-600" },
                { key: "prospect", label: "Prospects", cls: "text-blue-600" },
                { key: "customer", label: "Customers", cls: "text-emerald-600" },
              ].map((s) => (
                <Link key={s.key} href={`/crm?stage=${s.key}`} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-neutral-50">
                  <span className="text-sm text-neutral-600">{s.label}</span>
                  <span className={`text-lg font-semibold ${s.cls}`}>{stageCount(s.key)}</span>
                </Link>
              ))}
            </div>
          </Card>
          <Card className="lg:col-span-2">
            <h2 className="mb-3 text-sm font-semibold text-neutral-900">My open tasks</h2>
            {myTasks.length === 0 ? (
              <p className="text-sm text-neutral-400">No open tasks assigned to you.</p>
            ) : (
              <ul className="space-y-2">
                {myTasks.map((t) => {
                  const overdue = t.dueDate && t.dueDate.getTime() < Date.now();
                  return (
                    <li key={t.id} className="flex items-center justify-between gap-2">
                      <Link href={`/crm/${t.bpId}`} className="text-sm text-neutral-800 hover:underline">
                        {t.title} <span className="text-neutral-400">· {t.company}</span>
                      </Link>
                      <span className={`shrink-0 text-xs ${overdue ? "font-medium text-red-600" : "text-neutral-400"}`}>
                        {t.dueDate ? t.dueDate.toLocaleDateString() : "no due date"}{overdue ? " · overdue" : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      )}

      <Card className="mt-6">
        <h2 className="text-sm font-semibold text-neutral-900">Phase 1 — Platform Foundation</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Authentication, role-based access, user management, system configuration, audit logging,
          and notifications are live. Business modules appear in the sidebar and unlock as later
          phases ship.
        </p>
      </Card>
    </div>
  );
}
