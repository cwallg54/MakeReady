"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, orderEvents, productionJobs, activities, quotes } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView, canEdit } from "@/lib/rbac";
import { notifyTrackerStage } from "@/lib/orders/notify";
import { notifyTeam } from "@/lib/teams/notify";
import { pressCheckApproved } from "./press-check";
import { audit } from "@/lib/audit";

const PROD_STATUSES = ["queued", "in_production", "quality_check", "ready_to_ship", "shipped"] as const;
type ProdStatus = (typeof PROD_STATUSES)[number];

// Production job status → customer-facing order stage (keeps the tracker in sync).
const STATUS_TO_ORDER_STAGE: Record<ProdStatus, "production" | "quality" | "shipped"> = {
  queued: "production",
  in_production: "production",
  quality_check: "quality",
  ready_to_ship: "quality",
  shipped: "shipped",
};

async function requireProductionEdit() {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "jobs") || !canEdit(user.roles, "jobs")) redirect("/403");
  return user;
}

async function notifyProduction(title: string, body: string, link: string) {
  // Routes to the "production" team's members, falling back to the production role.
  await notifyTeam("production", { type: "production", title, body, link }, ["production"]);
}

/** Create the production job for an order if one doesn't already exist. */
async function ensureJob(orderId: string, userId: string) {
  const existing = await db.query.productionJobs.findFirst({ where: eq(productionJobs.orderId, orderId) });
  if (existing) return existing;
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  // Straight reorders (art unchanged) skip the first-article press check by default.
  let pressCheckRequired = true;
  if (order?.quoteId) {
    const quote = await db.query.quotes.findFirst({ where: eq(quotes.id, order.quoteId) });
    if (quote?.isReorder) pressCheckRequired = false;
  }
  const [job] = await db
    .insert(productionJobs)
    .values({ orderId, dueDate: order?.inHandsDate ?? null, notes: order?.productionNotes ?? null, pressCheckRequired, createdBy: userId })
    .returning();
  return job;
}
export { ensureJob };

async function syncOrderStage(orderId: string, stage: "production" | "quality" | "shipped", userId: string) {
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!order || order.stage === stage) return;
  await db.update(orders).set({ stage, updatedAt: new Date() }).where(eq(orders.id, orderId));
  await db.insert(orderEvents).values({ orderId, stage, byUserId: userId, note: "Production update" });
  if (order.bpId) revalidatePath(`/crm/${order.bpId}`);
  await notifyTrackerStage(orderId, stage);
}

/** Hand an order to production — creates the job, moves the order into the
 *  production stage, and notifies the production team. Called from the order. */
export async function sendToProductionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "sales") || !canEdit(user.roles, "sales")) redirect("/403");
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return;
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!order) return;

  await ensureJob(orderId, user.id);
  await syncOrderStage(orderId, "production", user.id);
  await notifyProduction("New production job", `Order ${order.orderNumber} is ready for production.`, "/production");
  if (order.bpId) {
    await db.insert(activities).values({ bpId: order.bpId, userId: user.id, type: "other", isSystem: true, content: `Order ${order.orderNumber} sent to production` });
  }
  await audit({ userId: user.id, action: "production.send", entityType: "order", entityId: orderId });
  revalidatePath(`/sales/orders/${orderId}`);
  revalidatePath("/production");
}

export async function setJobStatusAction(formData: FormData): Promise<void> {
  const user = await requireProductionEdit();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as ProdStatus;
  if (!id || !PROD_STATUSES.includes(status)) return;
  const job = await db.query.productionJobs.findFirst({ where: eq(productionJobs.id, id) });
  if (!job) return;
  // Press-check gate: a job that requires a first-article sign-off cannot leave
  // the queue (start the full run) until Art has approved the press check.
  if (job.status === "queued" && status !== "queued" && job.pressCheckRequired) {
    const approved = await pressCheckApproved(job.id);
    if (!approved) redirect(`/production/${id}?gate=presscheck`);
  }
  await db.update(productionJobs).set({ status, updatedAt: new Date() }).where(eq(productionJobs.id, id));
  await syncOrderStage(job.orderId, STATUS_TO_ORDER_STAGE[status], user.id);
  await audit({ userId: user.id, action: "production.status", entityType: "production_job", entityId: id, metadata: { status } });
  revalidatePath("/production");
  revalidatePath(`/production/${id}`);
}

export async function assignJobAction(formData: FormData): Promise<void> {
  const user = await requireProductionEdit();
  const id = String(formData.get("id") ?? "");
  const raw = String(formData.get("assignedTo") ?? "");
  const assignedTo = raw === "__me" ? user.id : raw === "__none" ? null : raw || null;
  if (!id) return;
  await db.update(productionJobs).set({ assignedTo, updatedAt: new Date() }).where(eq(productionJobs.id, id));
  await audit({ userId: user.id, action: "production.assign", entityType: "production_job", entityId: id, metadata: { assignedTo } });
  revalidatePath("/production");
}

export async function updateJobAction(formData: FormData): Promise<void> {
  const user = await requireProductionEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db
    .update(productionJobs)
    .set({ rush: formData.get("rush") === "on", notes: String(formData.get("notes") ?? "").trim() || null, updatedAt: new Date() })
    .where(eq(productionJobs.id, id));
  await audit({ userId: user.id, action: "production.update", entityType: "production_job", entityId: id });
  revalidatePath(`/production/${id}`);
  revalidatePath("/production");
}
