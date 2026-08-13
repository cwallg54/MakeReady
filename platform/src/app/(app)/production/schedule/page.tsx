import Link from "next/link";
import { eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { productionJobs, orders, businessPartners, users } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { upcomingShipDays, addShipDayAction, addShipWeekdaysAction, removeShipDayAction } from "@/lib/production/ship-calendar";

export const dynamic = "force-dynamic";

const inp = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-brand";
const WEEKDAYS = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [7, "Sun"]] as const;

const STATUS_LABEL: Record<string, string> = { queued: "Queued", in_production: "In production", quality_check: "Quality check", ready_to_ship: "Ready to ship", shipped: "Shipped" };
const STATUS_BADGE: Record<string, string> = { queued: "bg-neutral-200 text-neutral-600", in_production: "bg-blue-100 text-blue-700", quality_check: "bg-amber-100 text-amber-700", ready_to_ship: "bg-emerald-100 text-emerald-700" };

export default async function ProductionSchedulePage() {
  const user = await requireModule("jobs");
  const editable = canEdit(user.roles, "jobs");
  const shipDays = await upcomingShipDays(30);

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

  // eslint-disable-next-line react-hooks/purity -- server component; time-of-request is intended
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

      {/* Ship calendar — the dates the shop can ship on; orders pick from these. */}
      <div className="mb-6 rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-neutral-900">Ship calendar</h2>
        <p className="mb-3 text-xs text-neutral-500">The dates the shop can ship on. Orders choose their committed ship date from this list.</p>
        {shipDays.length === 0 ? (
          <p className="text-xs text-neutral-400">No ship dates set yet.{editable ? " Add some below." : ""}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {shipDays.map((d) => (
              <span key={d.day} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs text-neutral-700" title={d.note ?? undefined}>
                {fmtDate(new Date(d.day + "T12:00:00"))}{d.capacity != null ? ` · cap ${d.capacity}` : ""}
                {editable && (
                  <form action={removeShipDayAction} className="inline leading-none">
                    <input type="hidden" name="id" value={d.id} />
                    <button className="text-neutral-400 hover:text-red-600" title="Remove ship date">×</button>
                  </form>
                )}
              </span>
            ))}
          </div>
        )}
        {editable && (
          <div className="mt-3 grid gap-3 border-t border-neutral-100 pt-3 sm:grid-cols-2">
            <form action={addShipDayAction} className="flex flex-wrap items-end gap-2">
              <label className="text-xs font-medium text-neutral-600">Add a ship date
                <input type="date" name="day" required className={`mt-1 block ${inp}`} />
              </label>
              <input name="capacity" type="number" min="0" placeholder="cap" className={`w-16 ${inp}`} title="Optional daily cap" />
              <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">Add</button>
            </form>
            <form action={addShipWeekdaysAction} className="flex flex-wrap items-end gap-2">
              <label className="text-xs font-medium text-neutral-600">Bulk: from
                <input type="date" name="start" required className={`mt-1 block ${inp}`} />
              </label>
              <label className="text-xs font-medium text-neutral-600">to
                <input type="date" name="end" required className={`mt-1 block ${inp}`} />
              </label>
              <span className="flex flex-wrap items-center gap-1 text-[11px] text-neutral-600">
                {WEEKDAYS.map(([n, lbl]) => (
                  <label key={n} className="flex items-center gap-0.5"><input type="checkbox" name="weekday" value={n} defaultChecked={n <= 5} className="h-3 w-3" />{lbl}</label>
                ))}
              </span>
              <button className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Add weekdays</button>
            </form>
          </div>
        )}
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
