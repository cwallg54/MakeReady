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
    dueLabel: r.dueDate ? fmtDate(r.dueDate) : null,
    assignedTo: r.assignedTo,
    assigneeName: r.assigneeName,
    orderId: r.orderId,
    orderNumber: r.orderNumber ?? "—",
    company: r.company ?? "Walk-in",
  }));

  return (
    <div className="max-w-6xl">
      <PageHeader title="Art department" description="Requests submitted for design, customization, and proofing." />
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
