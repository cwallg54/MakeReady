"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { costCenters, costCenterAllocations, jobCosts, productionJobs } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView, canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";

async function requireControllingEdit() {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "controlling") || !canEdit(user.roles, "controlling")) redirect("/403");
  return user;
}
async function requireProductionEdit() {
  const user = await getCurrentUser();
  if (!user || !canEdit(user.roles, "jobs")) redirect("/403");
  return user;
}
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;
const money = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export async function createCostCenterAction(formData: FormData): Promise<void> {
  const user = await requireControllingEdit();
  const code = (str(formData.get("code")) ?? "").toUpperCase().slice(0, 12) || `CC${Date.now() % 10000}`;
  const [cc] = await db.insert(costCenters).values({
    code,
    name: str(formData.get("name")) ?? "New cost center",
    kind: str(formData.get("kind")) === "overhead" ? "overhead" : "department",
    laborRatePerHour: money(formData.get("laborRatePerHour")).toFixed(2),
    description: str(formData.get("description")),
  }).returning({ id: costCenters.id });
  await audit({ userId: user.id, action: "cost_center.create", entityType: "cost_center", entityId: cc.id });
  redirect(`/controlling/cost-centers/${cc.id}`);
}

export async function updateCostCenterAction(formData: FormData): Promise<void> {
  const user = await requireControllingEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.update(costCenters).set({
    name: str(formData.get("name")) ?? "Cost center",
    kind: str(formData.get("kind")) === "overhead" ? "overhead" : "department",
    laborRatePerHour: money(formData.get("laborRatePerHour")).toFixed(2),
    description: str(formData.get("description")),
    active: formData.get("active") === "on",
    updatedAt: new Date(),
  }).where(eq(costCenters.id, id));
  await audit({ userId: user.id, action: "cost_center.update", entityType: "cost_center", entityId: id });
  revalidatePath(`/controlling/cost-centers/${id}`);
}

export async function setAllocationAction(formData: FormData): Promise<void> {
  const user = await requireControllingEdit();
  const fromId = String(formData.get("fromId") ?? "");
  const toId = String(formData.get("toId") ?? "");
  if (!fromId || !toId) return;
  const pct = Math.max(0, Math.min(100, money(formData.get("pct"))));
  // Upsert on the (from, to) pair.
  const rules = await db.select().from(costCenterAllocations).where(eq(costCenterAllocations.fromCostCenterId, fromId));
  const match = rules.find((d) => d.toCostCenterId === toId);
  if (pct === 0) {
    if (match) await db.delete(costCenterAllocations).where(eq(costCenterAllocations.id, match.id));
  } else if (match) {
    await db.update(costCenterAllocations).set({ pct: pct.toFixed(3) }).where(eq(costCenterAllocations.id, match.id));
  } else {
    await db.insert(costCenterAllocations).values({ fromCostCenterId: fromId, toCostCenterId: toId, pct: pct.toFixed(3) });
  }
  await audit({ userId: user.id, action: "cost_center.allocate", entityType: "cost_center", entityId: fromId });
  revalidatePath(`/controlling/cost-centers/${fromId}`);
}

export async function addJobCostAction(formData: FormData): Promise<void> {
  const user = await requireProductionEdit();
  const jobId = String(formData.get("jobId") ?? "");
  if (!jobId) return;
  const job = await db.query.productionJobs.findFirst({ where: eq(productionJobs.id, jobId), columns: { orderId: true } });
  const kind = str(formData.get("kind")) ?? "labor";
  const costCenterId = str(formData.get("costCenterId"));
  const minutes = Math.max(0, Math.round(Number(formData.get("minutes")) || 0));
  let amount = money(formData.get("amount"));
  // Labor with a rate and minutes computes automatically when no amount is given.
  if (kind === "labor" && amount === 0 && minutes > 0 && costCenterId) {
    const cc = await db.query.costCenters.findFirst({ where: eq(costCenters.id, costCenterId), columns: { laborRatePerHour: true } });
    if (cc) amount = Math.round((minutes / 60) * Number(cc.laborRatePerHour) * 100) / 100;
  }
  if (amount === 0 && minutes === 0) return;
  await db.insert(jobCosts).values({
    jobId, orderId: job?.orderId ?? null, costCenterId, kind,
    description: str(formData.get("description")), minutes, amount: amount.toFixed(2), createdBy: user.id,
  });
  await audit({ userId: user.id, action: "job_cost.add", entityType: "production_job", entityId: jobId, metadata: { kind, amount } });
  revalidatePath(`/production/${jobId}`);
  revalidatePath(`/controlling/job-costing`);
}

export async function removeJobCostAction(formData: FormData): Promise<void> {
  const user = await requireProductionEdit();
  const id = String(formData.get("id") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  if (!id) return;
  await db.delete(jobCosts).where(eq(jobCosts.id, id));
  await audit({ userId: user.id, action: "job_cost.remove", entityType: "production_job", entityId: jobId });
  revalidatePath(`/production/${jobId}`);
}
