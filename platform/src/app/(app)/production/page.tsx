import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { productionJobs, orders, businessPartners, users, userRoles } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { PageHeader } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { ProductionBoard } from "./production-board";

export const dynamic = "force-dynamic";

export default async function ProductionPage() {
  const user = await requireModule("jobs");

  const rows = await db
    .select({
      id: productionJobs.id,
      status: productionJobs.status,
      rush: productionJobs.rush,
      dueDate: productionJobs.dueDate,
      assignedTo: productionJobs.assignedTo,
      orderId: productionJobs.orderId,
      orderNumber: orders.orderNumber,
      stage: orders.stage,
      company: businessPartners.companyName,
      assigneeName: users.name,
    })
    .from(productionJobs)
    .leftJoin(orders, eq(orders.id, productionJobs.orderId))
    .leftJoin(businessPartners, eq(businessPartners.id, orders.bpId))
    .leftJoin(users, eq(users.id, productionJobs.assignedTo))
    .orderBy(desc(productionJobs.updatedAt));

  const teamRaw = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(inArray(userRoles.role, ["production", "art"]));
  const team = Array.from(new Map(teamRaw.map((u) => [u.id, u])).values());

  const cards = rows.map((r) => ({
    id: r.id,
    status: r.status,
    rush: r.rush,
    dueLabel: r.dueDate ? fmtDate(r.dueDate) : null,
    assignedTo: r.assignedTo,
    assigneeName: r.assigneeName,
    orderId: r.orderId,
    orderNumber: r.orderNumber ?? "—",
    company: r.company ?? "Walk-in",
  }));

  return (
    <div className="max-w-6xl">
      <PageHeader title="Production" description="Jobs on the production floor — from queued to shipped." />
      {cards.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          No production jobs yet. Sales sends an order to production from the order page (or when the proof is approved).
        </div>
      ) : (
        <ProductionBoard cards={cards} team={team} meId={user.id} />
      )}
    </div>
  );
}
