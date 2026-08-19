import "server-only";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { equipment, maintenanceSchedules, maintenanceWorkOrders, users } from "@/db/schema";

export async function listEquipment() {
  const rows = await db.select().from(equipment).orderBy(asc(equipment.code));
  // Attach the count of open work orders per machine.
  const open = await db
    .select({ equipmentId: maintenanceWorkOrders.equipmentId, n: sql<string>`COUNT(*)` })
    .from(maintenanceWorkOrders)
    .where(ne(maintenanceWorkOrders.status, "completed"))
    .groupBy(maintenanceWorkOrders.equipmentId);
  const openBy = new Map(open.map((o) => [o.equipmentId, Number(o.n)]));
  return rows.map((e) => ({ ...e, openWorkOrders: openBy.get(e.id) ?? 0 }));
}

export async function maintenanceSummary() {
  const byStatus = await db.select({ status: equipment.status, n: sql<string>`COUNT(*)` }).from(equipment).groupBy(equipment.status);
  const counts = Object.fromEntries(byStatus.map((r) => [r.status, Number(r.n)]));
  const now = new Date();
  const dueSoon = await db.select({ n: sql<string>`COUNT(*)` }).from(maintenanceSchedules)
    .where(and(eq(maintenanceSchedules.active, true), sql`${maintenanceSchedules.nextDueDate} <= ${new Date(now.getTime() + 7 * 864e5)}`));
  const openWo = await db.select({ n: sql<string>`COUNT(*)` }).from(maintenanceWorkOrders).where(ne(maintenanceWorkOrders.status, "completed"));
  return {
    operational: counts["operational"] ?? 0,
    down: (counts["down"] ?? 0) + (counts["needs_service"] ?? 0),
    dueSoon: Number(dueSoon[0]?.n ?? 0),
    openWorkOrders: Number(openWo[0]?.n ?? 0),
  };
}

export async function getEquipment(id: string) {
  const eqp = await db.query.equipment.findFirst({ where: eq(equipment.id, id) });
  if (!eqp) return null;
  const [schedules, workOrders] = await Promise.all([
    db.select().from(maintenanceSchedules).where(eq(maintenanceSchedules.equipmentId, id)).orderBy(asc(maintenanceSchedules.nextDueDate)),
    db.select({ wo: maintenanceWorkOrders, assignee: users.name })
      .from(maintenanceWorkOrders).leftJoin(users, eq(users.id, maintenanceWorkOrders.assignedTo))
      .where(eq(maintenanceWorkOrders.equipmentId, id)).orderBy(desc(maintenanceWorkOrders.createdAt)),
  ]);
  return { eqp, schedules, workOrders: workOrders.map((r) => ({ ...r.wo, assignee: r.assignee })) };
}

export async function listWorkOrders(status?: string) {
  const q = db.select({ wo: maintenanceWorkOrders, equipmentName: equipment.name, equipmentCode: equipment.code, assignee: users.name })
    .from(maintenanceWorkOrders)
    .leftJoin(equipment, eq(equipment.id, maintenanceWorkOrders.equipmentId))
    .leftJoin(users, eq(users.id, maintenanceWorkOrders.assignedTo))
    .orderBy(desc(maintenanceWorkOrders.createdAt))
    .limit(300);
  const rows = await q;
  const filtered = status ? rows.filter((r) => r.wo.status === status) : rows;
  return filtered.map((r) => ({ ...r.wo, equipmentName: r.equipmentName, equipmentCode: r.equipmentCode, assignee: r.assignee }));
}

export async function getWorkOrder(id: string) {
  const row = await db.select({ wo: maintenanceWorkOrders, equipmentName: equipment.name, equipmentCode: equipment.code, equipmentId: equipment.id })
    .from(maintenanceWorkOrders).leftJoin(equipment, eq(equipment.id, maintenanceWorkOrders.equipmentId))
    .where(eq(maintenanceWorkOrders.id, id)).limit(1);
  if (!row[0]) return null;
  return { ...row[0].wo, equipmentName: row[0].equipmentName, equipmentCode: row[0].equipmentCode, equipmentId: row[0].equipmentId };
}

export async function assignableUsers() {
  return db.select({ id: users.id, name: users.name }).from(users).where(eq(users.status, "active")).orderBy(users.name);
}
