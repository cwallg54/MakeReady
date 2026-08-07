import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { artRequests, orders, businessPartners, users, userRoles } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canDoArt } from "@/lib/art/access";
import { PageHeader } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { ArtBoard } from "./art-board";

export const dynamic = "force-dynamic";

export default async function ArtPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canDoArt(user.roles)) redirect("/403");

  const rows = await db
    .select({
      id: artRequests.id,
      status: artRequests.status,
      rush: artRequests.rush,
      priority: artRequests.priority,
      estimatedMinutes: artRequests.estimatedMinutes,
      dueDate: artRequests.dueDate,
      assignedTo: artRequests.assignedTo,
      orderId: artRequests.orderId,
      orderNumber: orders.orderNumber,
      company: businessPartners.companyName,
      assigneeName: users.name,
    })
    .from(artRequests)
    .leftJoin(orders, eq(orders.id, artRequests.orderId))
    .leftJoin(businessPartners, eq(businessPartners.id, orders.bpId))
    .leftJoin(users, eq(users.id, artRequests.assignedTo))
    .orderBy(desc(artRequests.updatedAt));

  // Artist workload — open jobs and estimated hours per assignee.
  const workload = new Map<string, { name: string; count: number; minutes: number }>();
  for (const r of rows) {
    if (r.status === "done" || !r.assignedTo) continue;
    const w = workload.get(r.assignedTo) ?? { name: r.assigneeName ?? "—", count: 0, minutes: 0 };
    w.count += 1;
    w.minutes += r.estimatedMinutes ?? 0;
    workload.set(r.assignedTo, w);
  }
  const workloadList = [...workload.values()].sort((a, b) => b.minutes - a.minutes);

  const teamRaw = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(inArray(userRoles.role, ["art", "production"]));
  const team = Array.from(new Map(teamRaw.map((u) => [u.id, u])).values());

  const cards = rows.map((r) => ({
    id: r.id,
    status: r.status,
    rush: r.rush,
    priority: r.priority,
    estimatedMinutes: r.estimatedMinutes,
    dueLabel: r.dueDate ? fmtDate(r.dueDate) : null,
    assignedTo: r.assignedTo,
    assigneeName: r.assigneeName,
    orderId: r.orderId,
    orderNumber: r.orderNumber ?? "—",
    company: r.company ?? "Walk-in",
  }));

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between">
        <PageHeader title="Art department" description="Requests submitted for design, customization, and proofing." />
        <Link href="/art/schedule" className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">Schedule →</Link>
      </div>
      {workloadList.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {workloadList.map((w) => (
            <span key={w.name} className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-600">
              <span className="font-medium text-neutral-900">{w.name}</span> · {w.count} job{w.count === 1 ? "" : "s"}{w.minutes > 0 ? ` · ~${(w.minutes / 60).toFixed(1)}h` : ""}
            </span>
          ))}
        </div>
      )}
      {cards.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          No art requests yet. Sales submits an order to art from the order page.
        </div>
      ) : (
        <ArtBoard cards={cards} team={team} meId={user.id} />
      )}
    </div>
  );
}
