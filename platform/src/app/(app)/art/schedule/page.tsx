import Link from "next/link";
import { desc, eq, inArray, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { artRequests, orders, businessPartners, users, userRoles } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canDoArt } from "@/lib/art/access";
import { PageHeader, Card } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { buildSchedule, hours, type SchedJob } from "@/lib/art/scheduling";

export const dynamic = "force-dynamic";
const PRIORITY_BADGE: Record<string, string> = { p1: "bg-red-600 text-white", p2: "bg-amber-500 text-white" };

export default async function ArtSchedulePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canDoArt(user.roles)) redirect("/403");

  // Open (not-done) art jobs with their order + assignee.
  const rows = await db
    .select({
      id: artRequests.id, status: artRequests.status, priority: artRequests.priority, rush: artRequests.rush,
      estimatedMinutes: artRequests.estimatedMinutes, dueDate: artRequests.dueDate, assignedTo: artRequests.assignedTo,
      orderNumber: orders.orderNumber, company: businessPartners.companyName,
    })
    .from(artRequests)
    .leftJoin(orders, eq(orders.id, artRequests.orderId))
    .leftJoin(businessPartners, eq(businessPartners.id, orders.bpId))
    .where(ne(artRequests.status, "done"))
    .orderBy(desc(artRequests.updatedAt));

  const artTeam = await db
    .select({ id: users.id, name: users.name })
    .from(users).innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(inArray(userRoles.role, ["art", "production"]));
  const team = Array.from(new Map(artTeam.map((u) => [u.id, u])).values());

  const toJob = (r: (typeof rows)[number]): SchedJob => ({
    id: r.id, orderNumber: r.orderNumber ?? "—", company: r.company ?? "Walk-in", status: r.status,
    priority: r.priority, rush: r.rush, estimatedMinutes: r.estimatedMinutes, dueDate: r.dueDate,
  });

  // One column per artist + an unassigned column.
  const columns: { key: string; name: string; jobs: SchedJob[] }[] = team.map((t) => ({
    key: t.id, name: t.name, jobs: rows.filter((r) => r.assignedTo === t.id).map(toJob),
  }));
  const unassigned = rows.filter((r) => !r.assignedTo).map(toJob);
  columns.push({ key: "unassigned", name: "Unassigned", jobs: unassigned });
  const active = columns.filter((c) => c.jobs.length > 0);

  return (
    <div className="max-w-6xl space-y-5">
      <div className="flex items-center justify-between">
        <PageHeader title="Artist schedule" description="Each artist's queue in priority order, with projected turnaround from estimated times." />
        <Link href="/art" className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">← Board</Link>
      </div>

      {active.length === 0 ? (
        <Card className="text-center text-sm text-neutral-400">No open art jobs.</Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {active.map((col) => {
            const sched = buildSchedule(col.jobs);
            const totalMin = sched.reduce((s, j) => s + (j.estimatedMinutes ?? 0), 0);
            return (
              <Card key={col.key} className="p-0">
                <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-2.5">
                  <h2 className="text-sm font-semibold text-neutral-900">{col.name}</h2>
                  <span className="text-xs text-neutral-500">{col.jobs.length} job{col.jobs.length === 1 ? "" : "s"} · ~{hours(totalMin)}</span>
                </div>
                <ol className="divide-y divide-neutral-100">
                  {sched.map((j, i) => (
                    <li key={j.id} className="px-4 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-xs text-neutral-400">{i + 1}.</span>
                          <Link href={`/art/${j.id}`} className="ml-1 text-sm font-medium text-neutral-900 hover:underline">{j.orderNumber}</Link>
                          {j.priority !== "none" && <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${PRIORITY_BADGE[j.priority]}`}>{j.priority}</span>}
                          {j.rush && <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-700">Rush</span>}
                        </div>
                        <span className="shrink-0 text-xs text-neutral-500">{j.estimatedMinutes ? `~${hours(j.estimatedMinutes)}` : "—"}</span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between text-[11px] text-neutral-400">
                        <span className="truncate">{j.company}{j.dueDate ? ` · due ${fmtDate(j.dueDate)}` : ""}</span>
                        <span>ready ~day {j.daysOut}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              </Card>
            );
          })}
        </div>
      )}
      <p className="text-xs text-neutral-400">Order is Priority 1 → Priority 2 → Rush → earliest due date. Projected days assume ~6 productive hours/day and update automatically when priorities or estimates change.</p>
    </div>
  );
}
