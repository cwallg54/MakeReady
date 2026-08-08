import Link from "next/link";
import { eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { productionJobs, orders, businessPartners, users } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { PageHeader } from "@/components/ui";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { queued: "Queued", in_production: "In production", quality_check: "Quality check", ready_to_ship: "Ready to ship", shipped: "Shipped" };
const STATUS_BADGE: Record<string, string> = { queued: "bg-neutral-200 text-neutral-600", in_production: "bg-blue-100 text-blue-700", quality_check: "bg-amber-100 text-amber-700", ready_to_ship: "bg-emerald-100 text-emerald-700" };

export default async function ProductionSchedulePage() {
  await requireModule("jobs");

  const rows = await db
    .select({
      id: productionJobs.id,
      status: productionJobs.status,
      rush: productionJobs.rush,
      dueDate: productionJobs.dueDate,
      assignedTo: productionJobs.assignedTo,
      orderNumber: orders.orderNumber,
      company: businessPartners.companyName,
      assigneeName: users.name,
    })
    .from(productionJobs)
    .leftJoin(orders, eq(orders.id, productionJobs.orderId))
    .leftJoin(businessPartners, eq(businessPartners.id, orders.bpId))
    .leftJoin(users, eq(users.id, productionJobs.assignedTo))
    .where(ne(productionJobs.status, "shipped"));

  const now = Date.now();
  const SOON = now + 3 * 86_400_000;

  // Priority order: rush first, then earliest due date (undated last).
  const sorted = [...rows].sort((a, b) => {
    if (a.rush !== b.rush) return a.rush ? -1 : 1;
    const ad = a.dueDate ? a.dueDate.getTime() : Infinity;
    const bd = b.dueDate ? b.dueDate.getTime() : Infinity;
    return ad - bd;
  });

  // Group into per-operator queues (+ Unassigned).
  const groups = new Map<string, { name: string; jobs: typeof sorted }>();
  for (const r of sorted) {
    const key = r.assignedTo ?? "__none";
    if (!groups.has(key)) groups.set(key, { name: r.assignedTo ? r.assigneeName ?? "—" : "Unassigned", jobs: [] });
    groups.get(key)!.jobs.push(r);
  }
  const groupList = [...groups.values()].sort((a, b) => (a.name === "Unassigned" ? 1 : 0) - (b.name === "Unassigned" ? 1 : 0) || b.jobs.length - a.jobs.length);
  const overdueOf = (jobs: typeof sorted) => jobs.filter((j) => j.dueDate && j.dueDate.getTime() < now).length;
  const totalOverdue = overdueOf(sorted);

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between">
        <PageHeader title="Production schedule" description="What to run next — jobs sequenced by rush, then due date, per operator." />
        <Link href="/production" className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">Board →</Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <span className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-600"><span className="font-medium text-neutral-900">{sorted.length}</span> active job{sorted.length === 1 ? "" : "s"}</span>
        {totalOverdue > 0 && <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700">{totalOverdue} overdue</span>}
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">Nothing in the production queue right now.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groupList.map((g) => {
            const overdue = overdueOf(g.jobs);
            return (
              <div key={g.name} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-sm font-semibold text-neutral-800">{g.name}</span>
                  <span className="text-xs text-neutral-500">{g.jobs.length} job{g.jobs.length === 1 ? "" : "s"}{overdue > 0 ? ` · ${overdue} overdue` : ""}</span>
                </div>
                <ol className="space-y-2">
                  {g.jobs.map((j, i) => {
                    const due = j.dueDate?.getTime();
                    const isOverdue = due != null && due < now;
                    const isSoon = due != null && !isOverdue && due <= SOON;
                    return (
                      <li key={j.id}>
                        <Link href={`/production/${j.id}`} className={`block rounded-lg border bg-white p-3 hover:ring-2 hover:ring-neutral-300 ${isOverdue ? "border-red-300" : isSoon ? "border-amber-300" : "border-neutral-200"}`}>
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-sm font-semibold text-neutral-900">{i + 1}. {j.orderNumber ?? "—"}</span>
                            <span className="flex items-center gap-1">
                              {j.rush && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-700">Rush</span>}
                              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[j.status] ?? "bg-neutral-100 text-neutral-600"}`}>{STATUS_LABEL[j.status] ?? j.status}</span>
                            </span>
                          </div>
                          <p className="truncate text-xs text-neutral-500">{j.company ?? "Walk-in"}</p>
                          <p className={`mt-0.5 text-[11px] ${isOverdue ? "font-semibold text-red-600" : isSoon ? "font-medium text-amber-600" : "text-neutral-400"}`}>
                            {j.dueDate ? `${isOverdue ? "Overdue · due" : "Due"} ${fmtDate(j.dueDate)}` : "No due date"}
                          </p>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
