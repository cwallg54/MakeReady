"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { equipment, maintenanceSchedules, maintenanceWorkOrders } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView, canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { nextDocNumber } from "@/lib/number-series";

async function requireMaintEdit() {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "maintenance") || !canEdit(user.roles, "maintenance")) redirect("/403");
  return user;
}
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;
const int = (v: FormDataEntryValue | null) => Math.max(0, Math.round(Number(v) || 0));
const money = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const dt = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 864e5);

export async function createEquipmentAction(formData: FormData): Promise<void> {
  const user = await requireMaintEdit();
  const code = (str(formData.get("code")) ?? "") || (await nextDocNumber("equipment", "EQ-"));
  const [e] = await db.insert(equipment).values({
    code,
    name: str(formData.get("name")) ?? "New equipment",
    type: str(formData.get("type")) ?? "press",
    location: str(formData.get("location")),
    serialNumber: str(formData.get("serialNumber")),
    purchaseDate: dt(formData.get("purchaseDate")),
    createdBy: user.id,
  }).returning({ id: equipment.id });
  await audit({ userId: user.id, action: "equipment.create", entityType: "equipment", entityId: e.id });
  redirect(`/maintenance/${e.id}`);
}

export async function updateEquipmentAction(formData: FormData): Promise<void> {
  const user = await requireMaintEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.update(equipment).set({
    name: str(formData.get("name")) ?? "Equipment",
    type: str(formData.get("type")) ?? "press",
    location: str(formData.get("location")),
    serialNumber: str(formData.get("serialNumber")),
    status: str(formData.get("status")) ?? "operational",
    purchaseDate: dt(formData.get("purchaseDate")),
    notes: str(formData.get("notes")),
    updatedAt: new Date(),
  }).where(eq(equipment.id, id));
  await audit({ userId: user.id, action: "equipment.update", entityType: "equipment", entityId: id });
  revalidatePath(`/maintenance/${id}`);
}

export async function addScheduleAction(formData: FormData): Promise<void> {
  const user = await requireMaintEdit();
  const equipmentId = String(formData.get("equipmentId") ?? "");
  if (!equipmentId) return;
  const intervalDays = Math.max(1, int(formData.get("intervalDays")) || 30);
  const last = dt(formData.get("lastDoneDate")) ?? new Date();
  await db.insert(maintenanceSchedules).values({
    equipmentId, task: str(formData.get("task")) ?? "Preventive maintenance",
    intervalDays, lastDoneDate: last, nextDueDate: addDays(last, intervalDays),
  });
  await audit({ userId: user.id, action: "maintenance.schedule_add", entityType: "equipment", entityId: equipmentId });
  revalidatePath(`/maintenance/${equipmentId}`);
}

export async function completeScheduleAction(formData: FormData): Promise<void> {
  const user = await requireMaintEdit();
  const id = String(formData.get("id") ?? "");
  const equipmentId = String(formData.get("equipmentId") ?? "");
  if (!id) return;
  const s = await db.query.maintenanceSchedules.findFirst({ where: eq(maintenanceSchedules.id, id) });
  if (!s) return;
  const now = new Date();
  await db.update(maintenanceSchedules).set({ lastDoneDate: now, nextDueDate: addDays(now, s.intervalDays) }).where(eq(maintenanceSchedules.id, id));
  await audit({ userId: user.id, action: "maintenance.schedule_done", entityType: "equipment", entityId: equipmentId });
  revalidatePath(`/maintenance/${equipmentId}`);
}

export async function removeScheduleAction(formData: FormData): Promise<void> {
  const user = await requireMaintEdit();
  const id = String(formData.get("id") ?? "");
  const equipmentId = String(formData.get("equipmentId") ?? "");
  if (!id) return;
  await db.delete(maintenanceSchedules).where(eq(maintenanceSchedules.id, id));
  await audit({ userId: user.id, action: "maintenance.schedule_remove", entityType: "equipment", entityId: equipmentId });
  revalidatePath(`/maintenance/${equipmentId}`);
}

export async function createWorkOrderAction(formData: FormData): Promise<void> {
  const user = await requireMaintEdit();
  const equipmentId = String(formData.get("equipmentId") ?? "");
  if (!equipmentId) return;
  const woNumber = await nextDocNumber("maintenance_wo", "MWO-");
  const [wo] = await db.insert(maintenanceWorkOrders).values({
    woNumber, equipmentId,
    scheduleId: str(formData.get("scheduleId")),
    type: str(formData.get("type")) ?? "repair",
    priority: str(formData.get("priority")) ?? "normal",
    description: str(formData.get("description")),
    assignedTo: str(formData.get("assignedTo")),
    scheduledDate: dt(formData.get("scheduledDate")),
    createdBy: user.id,
  }).returning({ id: maintenanceWorkOrders.id });
  // A new repair/urgent WO flags the machine as needing service.
  if (str(formData.get("type")) === "repair") {
    await db.update(equipment).set({ status: "needs_service", updatedAt: new Date() }).where(eq(equipment.id, equipmentId));
  }
  await audit({ userId: user.id, action: "maintenance.wo_create", entityType: "maintenance_wo", entityId: wo.id });
  revalidatePath(`/maintenance/${equipmentId}`);
  redirect(`/maintenance/work-orders/${wo.id}`);
}

export async function updateWorkOrderAction(formData: FormData): Promise<void> {
  const user = await requireMaintEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const status = str(formData.get("status")) ?? "open";
  const completed = status === "completed";
  await db.update(maintenanceWorkOrders).set({
    status,
    priority: str(formData.get("priority")) ?? "normal",
    description: str(formData.get("description")),
    assignedTo: str(formData.get("assignedTo")),
    scheduledDate: dt(formData.get("scheduledDate")),
    downtimeMinutes: int(formData.get("downtimeMinutes")),
    cost: money(formData.get("cost")).toFixed(2),
    resolution: str(formData.get("resolution")),
    completedDate: completed ? new Date() : null,
    updatedAt: new Date(),
  }).where(eq(maintenanceWorkOrders.id, id));

  // When a WO completes, restore the machine to operational if it has no other
  // open work orders; a completed preventive WO also advances its schedule.
  const wo = await db.query.maintenanceWorkOrders.findFirst({ where: eq(maintenanceWorkOrders.id, id) });
  if (wo && completed) {
    const others = await db.select().from(maintenanceWorkOrders).where(eq(maintenanceWorkOrders.equipmentId, wo.equipmentId));
    if (!others.some((o) => o.id !== id && o.status !== "completed" && o.status !== "canceled")) {
      await db.update(equipment).set({ status: "operational", updatedAt: new Date() }).where(eq(equipment.id, wo.equipmentId));
    }
    if (wo.scheduleId) {
      const s = await db.query.maintenanceSchedules.findFirst({ where: eq(maintenanceSchedules.id, wo.scheduleId) });
      if (s) {
        const now = new Date();
        await db.update(maintenanceSchedules).set({ lastDoneDate: now, nextDueDate: addDays(now, s.intervalDays) }).where(eq(maintenanceSchedules.id, s.id));
      }
    }
  }
  await audit({ userId: user.id, action: "maintenance.wo_update", entityType: "maintenance_wo", entityId: id, metadata: { status } });
  revalidatePath(`/maintenance/work-orders/${id}`);
}
