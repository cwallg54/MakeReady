"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@/db";
import { and, ne } from "drizzle-orm";
import { orders, orderEvents, orderAttachments, orderSpecItems, orderProofs, artRequests, artRevisions, designItems, activities } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView, canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { notifyTrackerStage, notifyTracker } from "@/lib/orders/notify";
import { notifyTeam } from "@/lib/teams/notify";
import { artReadinessChecklist, productionReadinessChecklist } from "./gate";
import { estimateArtMinutes } from "./scheduling";
import { runArtHandoffAutomation } from "./automation";
import { canDoArt } from "./access";

const PROD_TYPES = ["screen_print", "embroidery", "headwear", "hard_goods", "other"] as const;
const str = (v: FormDataEntryValue | null) => { const s = String(v ?? "").trim(); return s || null; };
const intOrNull = (v: FormDataEntryValue | null) => { const n = Math.round(Number(String(v ?? "").trim())); return Number.isFinite(n) && n > 0 ? n : null; };

async function requireSalesEdit() {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "sales") || !canEdit(user.roles, "sales")) redirect("/403");
  return user;
}

const ART_STATUSES = ["todo", "in_progress", "proofing", "revisions", "approved", "done"] as const;
type ArtStatus = (typeof ART_STATUSES)[number];

async function requireArt() {
  const user = await getCurrentUser();
  if (!user || !canDoArt(user.roles)) redirect("/403");
  return user;
}

async function notifyArtTeam(title: string, body: string, link: string) {
  // Routes to the "art" team's members, falling back to everyone with the art role.
  await notifyTeam("art", { type: "art", title, body, link }, ["art"]);
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

  // Gatekeeper: the order can only enter art with a complete request. Enforced
  // on the initial hand-off (received → art_proof); the UI mirrors this checklist.
  if (order.stage === "received") {
    const [specItems, atts] = await Promise.all([
      db.select().from(orderSpecItems).where(eq(orderSpecItems.orderId, orderId)),
      db.select({ kind: orderAttachments.kind }).from(orderAttachments).where(eq(orderAttachments.orderId, orderId)),
    ]);
    if (!artReadinessChecklist(order, specItems, atts).complete) {
      redirect(`/sales/orders/${orderId}?art=incomplete`);
    }
  }

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
  const movedToArt = order.stage === "received";
  if (movedToArt) {
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
  if (movedToArt) await notifyTrackerStage(orderId, "art_proof");
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

/** Art staff set the production route + scheduling estimate + type-specific
 *  production details on an art request. */
export async function updateArtDetailsAction(formData: FormData): Promise<void> {
  const user = await requireArt();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const productionType = String(formData.get("productionType") ?? "");
  const validType = (PROD_TYPES as readonly string[]).includes(productionType) ? (productionType as (typeof PROD_TYPES)[number]) : null;
  const previousDesignRef = str(formData.get("previousDesignRef"));
  // Auto-estimate when the artist left the time blank but chose a production type.
  const estimatedMinutes = intOrNull(formData.get("estimatedMinutes")) ?? estimateArtMinutes(validType, !!previousDesignRef);
  await db.update(artRequests).set({
    estimatedMinutes,
    productionType: validType,
    stitchCount: intOrNull(formData.get("stitchCount")),
    separationsDone: formData.get("separationsDone") === "on",
    sourcingType: str(formData.get("sourcingType")),
    supplierNotes: str(formData.get("supplierNotes")),
    previousDesignRef,
    blankItemRef: str(formData.get("blankItemRef")),
    updatedAt: new Date(),
  }).where(eq(artRequests.id, id));
  await audit({ userId: user.id, action: "art.details", entityType: "art_request", entityId: id });
  // If separations were just completed on an already-approved job, auto-send them.
  await runArtHandoffAutomation(id, user.id);
  revalidatePath(`/art/${id}`);
  revalidatePath("/art");
}

/** Sales sets an art job's priority. Each salesperson may hold only one P1 and
 *  one P2 — assigning one clears any other of the same level on their jobs. */
export async function setArtPriorityAction(formData: FormData): Promise<void> {
  const user = await requireSalesEdit();
  const id = String(formData.get("id") ?? "");
  const priority = String(formData.get("priority") ?? "none");
  if (!id || !["none", "p1", "p2"].includes(priority)) return;
  const req = await db.query.artRequests.findFirst({ where: eq(artRequests.id, id) });
  if (!req) return;
  const order = await db.query.orders.findFirst({ where: eq(orders.id, req.orderId), columns: { salesRepId: true, createdBy: true } });
  const salesperson = order?.salesRepId ?? order?.createdBy ?? null;

  if (priority !== "none" && salesperson) {
    // Clear the same priority level from this salesperson's other art jobs.
    const theirs = await db.select({ id: artRequests.id })
      .from(artRequests).innerJoin(orders, eq(orders.id, artRequests.orderId))
      .where(and(eq(artRequests.priority, priority as "p1" | "p2"), ne(artRequests.id, id),
        sql`COALESCE(${orders.salesRepId}, ${orders.createdBy}) = ${salesperson}`));
    for (const t of theirs) await db.update(artRequests).set({ priority: "none", updatedAt: new Date() }).where(eq(artRequests.id, t.id));
  }
  await db.update(artRequests).set({ priority: priority as "none" | "p1" | "p2", updatedAt: new Date() }).where(eq(artRequests.id, id));
  await audit({ userId: user.id, action: "art.priority", entityType: "art_request", entityId: id, metadata: { priority } });
  revalidatePath("/art");
  revalidatePath(`/art/${id}`);
}

/** Headwear / hard-goods: mark that production files were sent to the buyer. */
export async function markBuyerSentAction(formData: FormData): Promise<void> {
  const user = await requireArt();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.update(artRequests).set({ buyerSentAt: new Date(), updatedAt: new Date() }).where(eq(artRequests.id, id));
  await audit({ userId: user.id, action: "art.buyer_sent", entityType: "art_request", entityId: id });
  revalidatePath(`/art/${id}`);
}

/** Embroidery: mark digitized/production files sent to the digitizer. */
export async function markDigitizerSentAction(formData: FormData): Promise<void> {
  const user = await requireArt();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.update(artRequests).set({ digitizerSentAt: new Date(), updatedAt: new Date() }).where(eq(artRequests.id, id));
  await audit({ userId: user.id, action: "art.digitizer_sent", entityType: "art_request", entityId: id });
  revalidatePath(`/art/${id}`);
}

/** Silkscreen: send completed separations to the Silkscreen department. Requires
 *  the artwork to be customer-approved (no pending changes) and seps completed. */
export async function markSeparationsSentAction(formData: FormData): Promise<void> {
  const user = await requireArt();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const req = await db.query.artRequests.findFirst({ where: eq(artRequests.id, id) });
  if (!req) return;
  const proofs = await db.select({ status: orderProofs.status }).from(orderProofs).where(eq(orderProofs.orderId, req.orderId));
  const approved = proofs.some((p) => p.status === "approved");
  const pending = proofs.some((p) => p.status === "pending");
  if (!req.separationsDone || !approved || pending) redirect(`/art/${id}?err=seps`);
  await db.update(artRequests).set({ separationsSentAt: new Date(), updatedAt: new Date() }).where(eq(artRequests.id, id));
  await notifyTeam("production", { type: "production", title: "Separations sent", body: "Silkscreen separations are ready in production.", link: "/production" }, ["production"]);
  await audit({ userId: user.id, action: "art.seps_sent", entityType: "art_request", entityId: id });
  revalidatePath(`/art/${id}`);
}

/** Upload a completed production/digitized file (kept with the order). */
export async function uploadProductionFileAction(formData: FormData): Promise<void> {
  const user = await requireArt();
  const orderId = String(formData.get("orderId") ?? "");
  const requestId = String(formData.get("requestId") ?? "");
  if (!orderId) return;
  const file = formData.get("file");
  if (file && typeof file === "object" && "arrayBuffer" in file) {
    const f = file as File;
    if (f.size > 0 && f.size <= 20_000_000) {
      const buf = Buffer.from(await f.arrayBuffer());
      await db.insert(orderAttachments).values({
        orderId, filename: f.name || "production-file", mimeType: f.type || "application/octet-stream",
        sizeBytes: f.size, kind: "production", contentBase64: buf.toString("base64"),
        notes: "Production/digitized file", uploadedBy: user.id,
      });
    }
  }
  await audit({ userId: user.id, action: "art.upload_production", entityType: "order", entityId: orderId });
  if (requestId) revalidatePath(`/art/${requestId}`);
}

/** Log a revision round (customer-requested change) with time spent. */
export async function logArtRevisionAction(formData: FormData): Promise<void> {
  const user = await requireArt();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.insert(artRevisions).values({ requestId: id, note: str(formData.get("note")), minutesSpent: intOrNull(formData.get("minutesSpent")), byUserId: user.id });
  await db.update(artRequests).set({ revisionCount: sql`${artRequests.revisionCount} + 1`, status: "revisions", updatedAt: new Date() }).where(eq(artRequests.id, id));
  await audit({ userId: user.id, action: "art.revision", entityType: "art_request", entityId: id });
  revalidatePath(`/art/${id}`);
  revalidatePath("/art");
}

/** Mark the job Production Ready — gated by the production-readiness checklist. */
export async function markProductionReadyAction(formData: FormData): Promise<void> {
  const user = await requireArt();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const req = await db.query.artRequests.findFirst({ where: eq(artRequests.id, id) });
  if (!req) return;
  const ready = await computeProdReady(req);
  if (!ready.complete) redirect(`/art/${id}?err=notready`);
  await db.update(artRequests).set({ productionReadyAt: new Date(), status: "done", updatedAt: new Date() }).where(eq(artRequests.id, id));
  await audit({ userId: user.id, action: "art.production_ready", entityType: "art_request", entityId: id });
  await notifyTeam("production", { type: "production", title: "Art production-ready", body: `An art job is production-ready.`, link: "/art" }, ["production"]);
  revalidatePath(`/art/${id}`);
  revalidatePath("/art");
}

/** Sales sends an order back to art for rework (e.g. upsold to a different
 *  product that the design wasn't built for) — outside the normal flow. */
export async function reopenArtAction(formData: FormData): Promise<void> {
  const user = await requireSalesEdit();
  const orderId = String(formData.get("orderId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!orderId) return;
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!order) return;
  const existing = await db.query.artRequests.findFirst({ where: eq(artRequests.orderId, orderId) });
  if (existing) {
    await db.update(artRequests).set({ status: "todo", productionReadyAt: null, updatedAt: new Date() }).where(eq(artRequests.id, existing.id));
  } else {
    await db.insert(artRequests).values({ orderId, brief: reason || order.productionNotes || null, dueDate: order.inHandsDate ?? null, createdBy: user.id });
  }
  if (order.stage !== "art_proof") {
    await db.update(orders).set({ stage: "art_proof", updatedAt: new Date() }).where(eq(orders.id, orderId));
    await db.insert(orderEvents).values({ orderId, stage: "art_proof", byUserId: user.id, note: `Back to art: ${reason || "product change / rework"}` });
    await notifyTrackerStage(orderId, "art_proof");
  }
  await notifyArtTeam("Order back in art", `Order ${order.orderNumber} was sent back to art (${reason || "rework"}).`, "/art");
  await audit({ userId: user.id, action: "art.reopen", entityType: "order", entityId: orderId, metadata: { reason } });
  revalidatePath(`/sales/orders/${orderId}`);
  revalidatePath("/art");
}

/** Compute the production-readiness checklist for a request (used by the
 *  mark-ready gate; the page computes the same inputs for display). */
async function computeProdReady(req: typeof artRequests.$inferSelect) {
  const [order, design, proofs, specs, atts] = await Promise.all([
    db.query.orders.findFirst({ where: eq(orders.id, req.orderId), columns: { productionNotes: true } }),
    req.designItemId ? db.query.designItems.findFirst({ where: eq(designItems.id, req.designItemId), columns: { status: true } }) : Promise.resolve(null),
    db.select({ status: orderProofs.status }).from(orderProofs).where(eq(orderProofs.orderId, req.orderId)),
    db.select({ decorationMethod: orderSpecItems.decorationMethod }).from(orderSpecItems).where(eq(orderSpecItems.orderId, req.orderId)),
    db.select({ kind: orderAttachments.kind }).from(orderAttachments).where(eq(orderAttachments.orderId, req.orderId)),
  ]);
  return productionReadinessChecklist({
    productionType: req.productionType, stitchCount: req.stitchCount, separationsDone: req.separationsDone,
    buyerSentAt: req.buyerSentAt, estimatedMinutes: req.estimatedMinutes, blankItemRef: req.blankItemRef,
    designActive: design?.status === "active",
    hasApprovedProof: proofs.some((p) => p.status === "approved"),
    hasPendingProof: proofs.some((p) => p.status === "pending"),
    hasArtwork: atts.some((a) => a.kind === "mockup" || a.kind === "art"),
    hasSpec: specs.length > 0,
    specHasDecoration: specs.some((s) => !!s.decorationMethod),
    hasSpecialInstructions: !!(req.brief || order?.productionNotes),
  });
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
  // SOP step 4: notify the customer their artwork is ready to review.
  await notifyTracker(orderId, {
    subject: `Your proof is ready to review — order ${order?.orderNumber ?? ""}`.trim(),
    headline: "Your proof is ready to review",
    body: "We&rsquo;ve prepared a proof of your artwork. Please review it and approve or request changes on your order page.",
    actionNeeded: true,
  });
  await audit({ userId: user.id, action: "art.send_proof", entityType: "order", entityId: orderId });
  if (requestId) revalidatePath(`/art/${requestId}`);
  revalidatePath("/art");
}
