"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@/db";
import { orders, orderEvents, orderAttachments, orderProofs, artRequests, designItems, userRoles, notifications, activities } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView, canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { canDoArt } from "./access";

const ART_STATUSES = ["todo", "in_progress", "proofing", "revisions", "approved", "done"] as const;
type ArtStatus = (typeof ART_STATUSES)[number];

async function requireArt() {
  const user = await getCurrentUser();
  if (!user || !canDoArt(user.roles)) redirect("/403");
  return user;
}

async function notifyArtTeam(title: string, body: string, link: string) {
  const team = await db.select({ id: userRoles.userId }).from(userRoles).where(eq(userRoles.role, "art"));
  if (team.length) {
    await db.insert(notifications).values(team.map((u) => ({ userId: u.id, type: "art", title, body, link })));
  }
}

/** Salesperson hands an order to the art department. Creates the art request
 *  (idempotent), moves the order into the art_proof stage, and notifies art. */
export async function submitToArtAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "sales") || !canEdit(user.roles, "sales")) redirect("/403");
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return;
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!order) return;

  const existing = await db.query.artRequests.findFirst({ where: eq(artRequests.orderId, orderId) });
  if (!existing) {
    await db.insert(artRequests).values({
      orderId,
      brief: String(formData.get("brief") ?? "").trim() || order.productionNotes || null,
      rush: formData.get("rush") === "on",
      dueDate: order.inHandsDate ?? null,
      createdBy: user.id,
    });
  }
  if (order.stage === "received") {
    await db.update(orders).set({ stage: "art_proof", updatedAt: new Date() }).where(eq(orders.id, orderId));
    await db.insert(orderEvents).values({ orderId, stage: "art_proof", byUserId: user.id, note: "Submitted to art department" });
  }
  await notifyArtTeam(
    "New art request",
    `Order ${order.orderNumber} was submitted to the art department.`,
    "/art",
  );
  if (order.bpId) {
    await db.insert(activities).values({ bpId: order.bpId, userId: user.id, type: "other", isSystem: true, content: `Order ${order.orderNumber} submitted to the art department` });
    revalidatePath(`/crm/${order.bpId}`);
  }
  await audit({ userId: user.id, action: "art.submit", entityType: "order", entityId: orderId });
  revalidatePath(`/sales/orders/${orderId}`);
  revalidatePath("/art");
}

// Advancing past the proof stage requires the orderable design to be punched in
// first — the gate that stops art jobs finishing before sales can order the item.
const GATED_STATUSES: ArtStatus[] = ["approved", "done"];

/** Move an art request to a new Kanban column (status). */
export async function setArtStatusAction(formData: FormData): Promise<void> {
  const user = await requireArt();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as ArtStatus;
  if (!id || !ART_STATUSES.includes(status)) return;

  if (GATED_STATUSES.includes(status)) {
    const req = await db.query.artRequests.findFirst({ where: eq(artRequests.id, id) });
    const design = req?.designItemId ? await db.query.designItems.findFirst({ where: eq(designItems.id, req.designItemId) }) : null;
    // Must have a linked design that is orderable (active = has item # + barcode).
    if (!design || design.status !== "active") {
      const from = String(formData.get("from") ?? "");
      redirect(`/art/${id}?err=needdesign${from ? `&from=${from}` : ""}`);
    }
  }

  await db.update(artRequests).set({ status, updatedAt: new Date() }).where(eq(artRequests.id, id));
  await audit({ userId: user.id, action: "art.status", entityType: "art_request", entityId: id, metadata: { status } });
  revalidatePath("/art");
  revalidatePath(`/art/${id}`);
}

/** Assign (or unassign) an art request. Empty userId assigns to self. */
export async function assignArtAction(formData: FormData): Promise<void> {
  const user = await requireArt();
  const id = String(formData.get("id") ?? "");
  const raw = String(formData.get("assignedTo") ?? "");
  const assignedTo = raw === "__me" ? user.id : raw === "__none" ? null : raw || null;
  if (!id) return;
  await db.update(artRequests).set({ assignedTo, updatedAt: new Date() }).where(eq(artRequests.id, id));
  await audit({ userId: user.id, action: "art.assign", entityType: "art_request", entityId: id, metadata: { assignedTo } });
  revalidatePath("/art");
}

/** Update the rush flag / brief on an art request. */
export async function updateArtRequestAction(formData: FormData): Promise<void> {
  const user = await requireArt();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db
    .update(artRequests)
    .set({ rush: formData.get("rush") === "on", brief: String(formData.get("brief") ?? "").trim() || null, updatedAt: new Date() })
    .where(eq(artRequests.id, id));
  await audit({ userId: user.id, action: "art.update", entityType: "art_request", entityId: id });
  revalidatePath("/art");
  revalidatePath(`/art/${id}`);
}

/** Art staff upload proposed/customized artwork onto the order. */
export async function uploadArtAction(formData: FormData): Promise<void> {
  const user = await requireArt();
  const orderId = String(formData.get("orderId") ?? "");
  const requestId = String(formData.get("requestId") ?? "");
  if (!orderId) return;
  const file = formData.get("file");
  if (file && typeof file === "object" && "arrayBuffer" in file) {
    const f = file as File;
    if (f.size > 0 && f.size <= 15_000_000) {
      const buf = Buffer.from(await f.arrayBuffer());
      await db.insert(orderAttachments).values({
        orderId,
        filename: f.name || "proposed-art",
        mimeType: f.type || "application/octet-stream",
        sizeBytes: f.size,
        kind: "mockup",
        contentBase64: buf.toString("base64"),
        notes: "Proposed art (art department)",
        uploadedBy: user.id,
      });
    }
  }
  await audit({ userId: user.id, action: "art.upload", entityType: "order", entityId: orderId });
  if (requestId) revalidatePath(`/art/${requestId}`);
  revalidatePath("/art");
}

/** Art staff send a proof to the customer — it appears on the order tracker. */
export async function sendArtProofAction(formData: FormData): Promise<void> {
  const user = await requireArt();
  const orderId = String(formData.get("orderId") ?? "");
  const requestId = String(formData.get("requestId") ?? "");
  const attachmentId = String(formData.get("attachmentId") ?? "") || null;
  if (!orderId) return;

  await db.insert(orderProofs).values({
    orderId,
    attachmentId,
    token: randomBytes(24).toString("hex"),
    title: String(formData.get("title") ?? "").trim() || "Proof",
    message: String(formData.get("message") ?? "").trim() || null,
    requestedBy: user.id,
  });
  if (requestId) await db.update(artRequests).set({ status: "proofing", updatedAt: new Date() }).where(eq(artRequests.id, requestId));

  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (order?.bpId) {
    await db.insert(activities).values({ bpId: order.bpId, userId: user.id, type: "other", isSystem: true, content: `Proof sent to customer for order ${order.orderNumber} — visible on their tracking link` });
    revalidatePath(`/crm/${order.bpId}`);
  }
  await audit({ userId: user.id, action: "art.send_proof", entityType: "order", entityId: orderId });
  if (requestId) revalidatePath(`/art/${requestId}`);
  revalidatePath("/art");
}
