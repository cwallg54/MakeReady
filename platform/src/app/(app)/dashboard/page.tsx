import { requireUser } from "@/lib/auth/guards";
import { canView, ROLE_LABELS } from "@/lib/rbac";
import { PageHeader, StatCard, Card } from "@/components/ui";
import { db } from "@/db";
import { users, auditLog } from "@/db/schema";
import { count, gte } from "drizzle-orm";

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
