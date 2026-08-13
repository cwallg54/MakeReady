"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, asc, eq, gte } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db";
import { shipCalendar, orders } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView, canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";

async function requireProductionEdit() {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "jobs") || !canEdit(user.roles, "jobs")) redirect("/403");
  return user;
}

/** Upcoming active ship days (yyyy-MM-dd), today onward, ascending. */
export async function upcomingShipDays(limit = 60): Promise<{ id: string; day: string; note: string | null; capacity: number | null }[]> {
  const today = DateTime.now().setZone("America/Denver").toFormat("yyyy-MM-dd");
  const rows = await db
    .select({ id: shipCalendar.id, day: shipCalendar.day, note: shipCalendar.note, capacity: shipCalendar.capacity })
    .from(shipCalendar)
    .where(and(eq(shipCalendar.active, true), gte(shipCalendar.day, today)))
    .orderBy(asc(shipCalendar.day))
    .limit(limit);
  return rows;
}

/** Add a single ship day (idempotent on the unique day). */
export async function addShipDayAction(formData: FormData): Promise<void> {
  const user = await requireProductionEdit();
  const day = String(formData.get("day") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
  const capRaw = String(formData.get("capacity") ?? "").trim();
  const capacity = capRaw ? Math.max(0, Math.round(Number(capRaw))) : null;
  const note = String(formData.get("note") ?? "").trim() || null;
  await db
    .insert(shipCalendar)
    .values({ day, capacity, note, createdBy: user.id })
    .onConflictDoUpdate({ target: shipCalendar.day, set: { capacity, note, active: true } });
  await audit({ userId: user.id, action: "shipcal.add", entityType: "ship_calendar", entityId: day });
  revalidatePath("/production/schedule");
}

/** Add all matching weekdays across a date range (e.g. every Mon/Wed/Fri). */
export async function addShipWeekdaysAction(formData: FormData): Promise<void> {
  const user = await requireProductionEdit();
  const start = String(formData.get("start") ?? "").trim();
  const end = String(formData.get("end") ?? "").trim();
  const weekdays = formData.getAll("weekday").map((w) => Number(w)); // 1=Mon..7=Sun (luxon)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || !weekdays.length) return;
  let d = DateTime.fromISO(start, { zone: "America/Denver" });
  const last = DateTime.fromISO(end, { zone: "America/Denver" });
  const days: string[] = [];
  let guard = 0;
  while (d <= last && guard++ < 400) {
    if (weekdays.includes(d.weekday)) days.push(d.toFormat("yyyy-MM-dd"));
    d = d.plus({ days: 1 });
  }
  for (const day of days) {
    await db.insert(shipCalendar).values({ day, createdBy: user.id }).onConflictDoUpdate({ target: shipCalendar.day, set: { active: true } });
  }
  await audit({ userId: user.id, action: "shipcal.bulk", entityType: "ship_calendar", metadata: { count: days.length } });
  revalidatePath("/production/schedule");
}

export async function removeShipDayAction(formData: FormData): Promise<void> {
  const user = await requireProductionEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.update(shipCalendar).set({ active: false }).where(eq(shipCalendar.id, id));
  await audit({ userId: user.id, action: "shipcal.remove", entityType: "ship_calendar", entityId: id });
  revalidatePath("/production/schedule");
}

/** Set an order's committed ship date (must be an active ship day, or cleared). */
export async function setOrderShipDateAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !canEdit(user.roles, "sales")) redirect("/403");
  const orderId = String(formData.get("orderId") ?? "");
  const day = String(formData.get("shipDate") ?? "").trim();
  if (!orderId) return;
  const value = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
  await db.update(orders).set({ shipDate: value, updatedAt: new Date() }).where(eq(orders.id, orderId));
  await audit({ userId: user.id, action: "order.ship_date", entityType: "order", entityId: orderId, metadata: { shipDate: value } });
  revalidatePath(`/sales/orders/${orderId}`);
}
