import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { canView, canEdit, crmScopedToOwn, ROLE_LABELS } from "@/lib/rbac";
import { PageHeader, StatCard, Card } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { db } from "@/db";
import { users, auditLog, businessPartners, crmTasks, quotes, orders, productionJobs, inventoryItems } from "@/db/schema";
import { and, asc, count, eq, gte, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";

export default async function DashboardPage() {
  const user = await requireUser();

  const showAdminStats = user.roles.includes("admin");
  const showCrm = canView(user.roles, "crm");
  const showSales = canView(user.roles, "sales");
  const showJobs = canView(user.roles, "jobs");
  const showInv = canView(user.roles, "inventory");
  const scoped = crmScopedToOwn(user.roles);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  type StageCount = { stage: "lead" | "prospect" | "customer"; n: number };
  type MyTask = { id: string; title: string; dueDate: Date | null; company: string; bpId: string };
  const zero = Promise.resolve([{ n: 0 }]);

  // Open-quote / open-order conditions (scoped to the rep's own records).
  const openQuoteWhere: SQL = scoped
    ? (and(inArray(quotes.status, ["draft", "sent"]), eq(quotes.createdBy, user.id)) as SQL)
    : inArray(quotes.status, ["draft", "sent"]);
  const openOrderConds: SQL[] = [ne(orders.stage, "delivered"), isNull(orders.voidedAt)];
  if (scoped) openOrderConds.push(eq(orders.createdBy, user.id));

  // Everything fetches in one parallel batch.
  const [uRow, eRow, stageCounts, myTasks, oqRow, ooRow, jobRow, lowRow] = await Promise.all([
    showAdminStats ? db.select({ n: count() }).from(users) : zero,
    showAdminStats ? db.select({ n: count() }).from(auditLog).where(gte(auditLog.createdAt, startOfDay)) : zero,
    showCrm
      ? db.select({ stage: businessPartners.lifecycleStage, n: count() }).from(businessPartners).where(scoped ? eq(businessPartners.ownerId, user.id) : undefined).groupBy(businessPartners.lifecycleStage)
      : Promise.resolve([] as StageCount[]),
    showCrm
      ? db.select({ id: crmTasks.id, title: crmTasks.title, dueDate: crmTasks.dueDate, company: businessPartners.companyName, bpId: crmTasks.bpId })
          .from(crmTasks).innerJoin(businessPartners, eq(crmTasks.bpId, businessPartners.id))
          .where(and(eq(crmTasks.assignedToId, user.id), eq(crmTasks.status, "open")))
          .orderBy(asc(crmTasks.dueDate)).limit(8)
      : Promise.resolve([] as MyTask[]),
    showSales ? db.select({ n: count() }).from(quotes).where(openQuoteWhere) : zero,
    showSales ? db.select({ n: count() }).from(orders).where(and(...openOrderConds)) : zero,
    showJobs ? db.select({ n: count() }).from(productionJobs).where(ne(productionJobs.status, "shipped")) : zero,
    showInv ? db.select({ n: count() }).from(inventoryItems).where(sql`${inventoryItems.onHand} <= ${inventoryItems.reorderPoint} and ${inventoryItems.reorderPoint} > 0`) : zero,
  ]);
  const stageCount = (s: string) => stageCounts.find((r) => r.stage === s)?.n ?? 0;
  const firstName = user.name.split(" ")[0];

  // Live stat tiles that link to the relevant screen.
  const stats: { label: string; value: number; hint: string; href: string }[] = [];
  if (showSales) stats.push({ label: "Open quotes", value: oqRow[0]?.n ?? 0, hint: "Draft & sent", href: "/sales" });
  if (showSales) stats.push({ label: "Open orders", value: ooRow[0]?.n ?? 0, hint: "Not yet delivered", href: "/sales/orders" });
  if (showJobs) stats.push({ label: "Jobs in production", value: jobRow[0]?.n ?? 0, hint: "Active on the floor", href: "/production" });
  if (showInv) stats.push({ label: "Low-stock items", value: lowRow[0]?.n ?? 0, hint: "At/below reorder point", href: "/inventory?low=1" });
  if (showAdminStats) stats.push({ label: "Users", value: uRow[0]?.n ?? 0, hint: "Active + inactive", href: "/admin/users" });
  if (showAdminStats) stats.push({ label: "Audit events today", value: eRow[0]?.n ?? 0, hint: "Since midnight", href: "/admin/audit" });

  // Quick actions (relevant to the signed-in role); handy on mobile.
  const isMgr = user.roles.some((r) => ["admin", "sales_manager", "finance"].includes(r));
  const actions: { label: string; href: string }[] = [];
  if (canEdit(user.roles, "sales")) actions.push({ label: "＋ New quote", href: "/sales/quotes/new" });
  if (canEdit(user.roles, "crm")) actions.push({ label: "＋ New business partner", href: "/crm/new" });
  if (showCrm) actions.push({ label: "Pipeline", href: "/crm/pipeline" });
  if (showSales) actions.push({ label: "Orders", href: "/sales/orders" });
  if (showSales) actions.push({ label: "Calendar", href: "/calendar" });
  if (isMgr) actions.push({ label: "Reports", href: "/reports" });

  return (
    <div>
      <PageHeader
        title={`Welcome, ${firstName}`}
        description={`Signed in as ${user.roles.map((r) => ROLE_LABELS[r]).join(", ")}.`}
      />

      {stats.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((s) => (
            <Link key={s.label} href={s.href} className="block transition-shadow hover:shadow-md">
              <StatCard label={s.label} value={s.value} hint={s.hint} />
            </Link>
          ))}
        </div>
      )}

      {showCrm && (
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <h2 className="mb-3 text-sm font-semibold text-neutral-900">Pipeline</h2>
            <div className="space-y-2">
              {[
                { key: "lead", label: "Leads", cls: "text-amber-600" },
                { key: "prospect", label: "Prospects", cls: "text-brand-ink" },
                { key: "customer", label: "Customers", cls: "text-emerald-600" },
              ].map((s) => (
                <Link key={s.key} href={`/crm?stage=${s.key}`} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-neutral-50">
                  <span className="text-sm text-neutral-600">{s.label}</span>
                  <span className={`text-lg font-semibold ${s.cls}`}>{stageCount(s.key).toLocaleString()}</span>
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
                      <Link href={`/crm/${t.bpId}`} className="min-w-0 truncate text-sm text-neutral-800 hover:underline">
                        {t.title} <span className="text-neutral-400">· {t.company}</span>
                      </Link>
                      <span className={`shrink-0 text-xs ${overdue ? "font-medium text-red-600" : "text-neutral-400"}`}>
                        {t.dueDate ? fmtDate(t.dueDate) : "no due date"}{overdue ? " · overdue" : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      )}

      {actions.length > 0 && (
        <Card className="mt-6">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Quick actions</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {actions.map((a) => (
              <Link key={a.href} href={a.href} className="rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-center text-sm font-medium text-neutral-700 hover:bg-neutral-50 active:bg-neutral-100">
                {a.label}
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
