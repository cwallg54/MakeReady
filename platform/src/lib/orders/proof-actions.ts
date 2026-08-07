"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@/db";
import { orders, orderProofs, activities, notifications, schedulingProfiles, artRequests, artRevisions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { consumeRateLimit, clientIp, retryMessage } from "@/lib/security/rate-limit";
import { canView, canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { notifyTracker } from "./notify";

async function requireSalesEdit() {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "sales") || !canEdit(user.roles, "sales")) redirect("/403");
  return user;
}

export async function createProofAction(formData: FormData): Promise<void> {
  const user = await requireSalesEdit();
  const orderId = String(formData.get("orderId") ?? "");
  const attachmentId = String(formData.get("attachmentId") ?? "") || null;
  if (!orderId) return;

  const title = String(formData.get("title") ?? "").trim() || "Proof";
  await db.insert(orderProofs).values({
    orderId,
    attachmentId,
    token: randomBytes(24).toString("hex"),
    title,
    message: String(formData.get("message") ?? "").trim() || null,
    requestedBy: user.id,
  });
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (order?.bpId) {
    await db.insert(activities).values({ bpId: order.bpId, userId: user.id, type: "other", isSystem: true, content: `Proof approval requested for order ${order.orderNumber}` });
    revalidatePath(`/crm/${order.bpId}`);
  }
  await audit({ userId: user.id, action: "proof.create", entityType: "order", entityId: orderId });
  await notifyTracker(orderId, {
    subject: `Action needed — proof ready to approve for order ${order?.orderNumber ?? ""}`.trim(),
    headline: "A proof is ready for your approval",
    body: `We&rsquo;ve prepared a proof (&ldquo;${title}&rdquo;) for your order. Please review it and approve or request changes on your order page.`,
    actionNeeded: true,
  });
  revalidatePath(`/sales/orders/${orderId}`);
}

export async function deleteProofAction(formData: FormData): Promise<void> {
  const user = await requireSalesEdit();
  const orderId = String(formData.get("orderId") ?? "");
  const proofId = String(formData.get("proofId") ?? "");
  if (!orderId || !proofId) return;
  await db.delete(orderProofs).where(and(eq(orderProofs.id, proofId), eq(orderProofs.orderId, orderId)));
  await audit({ userId: user.id, action: "proof.delete", entityType: "order", entityId: orderId });
  revalidatePath(`/sales/orders/${orderId}`);
}

export interface ProofDecisionState {
  error?: string;
  done?: boolean;
  bookingUrl?: string;
}

/** Public — the customer's Approve / Request changes / Decline / Request-a-meeting decision. */
export async function submitProofDecisionAction(_prev: ProofDecisionState, formData: FormData): Promise<ProofDecisionState> {
  const rl = await consumeRateLimit("proof-decision", await clientIp(), 30, 600);
  if (!rl.ok) return { error: `Too many attempts. ${retryMessage(rl.retryAfterSec)}` };
  const token = String(formData.get("token") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const signedName = String(formData.get("signedName") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const map: Record<string, "approved" | "changes_requested" | "declined" | "meeting_requested"> = {
    approve: "approved",
    changes: "changes_requested",
    decline: "declined",
    meeting: "meeting_requested",
  };
  const status = map[decision];
  if (!token || !status) return { error: "Please choose an option." };
  if (!signedName) return { error: "Please type your name to sign." };
  if ((status === "changes_requested" || status === "declined") && !notes) return { error: "Please tell us what needs to change." };

  const proof = await db.query.orderProofs.findFirst({ where: eq(orderProofs.token, token) });
  if (!proof) return { error: "This approval link is not valid." };
  if (proof.status !== "pending") return { done: true }; // already decided

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  await db
    .update(orderProofs)
    .set({ status, signedName, responseNotes: notes || null, respondedAt: new Date(), ip })
    .where(eq(orderProofs.id, proof.id));

  // Notify the requester + log to the customer's history.
  const order = await db.query.orders.findFirst({ where: eq(orders.id, proof.orderId) });
  const label =
    status === "approved" ? "approved"
    : status === "changes_requested" ? "requested changes on"
    : status === "meeting_requested" ? "requested a meeting about"
    : "declined";
  if (proof.requestedBy) {
    await db.insert(notifications).values({
      userId: proof.requestedBy,
      type: "proof",
      title: status === "meeting_requested" ? "Meeting requested on proof" : `Proof ${label}`,
      body: `${signedName} ${label} “${proof.title}”${order ? ` on ${order.orderNumber}` : ""}.`,
      link: order ? `/sales/orders/${order.id}` : "/sales/orders",
    });
  }
  if (order?.bpId) {
    await db.insert(activities).values({
      bpId: order.bpId,
      type: status === "approved" ? "other" : "note",
      isSystem: true,
      content: `Customer ${label} proof “${proof.title}” (signed: ${signedName})${notes ? ` — ${notes}` : ""}`,
    });
  }

  // Keep the art request in step: approval marks it approved (back to sales for
  // order entry); a change request logs a revision round and reopens it.
  const artReq = await db.query.artRequests.findFirst({ where: eq(artRequests.orderId, proof.orderId) });
  if (artReq) {
    if (status === "approved") {
      await db.update(artRequests).set({ status: "approved", updatedAt: new Date() }).where(eq(artRequests.id, artReq.id));
    } else if (status === "changes_requested") {
      await db.insert(artRevisions).values({ requestId: artReq.id, note: notes || null });
      await db.update(artRequests).set({ status: "revisions", revisionCount: sql`${artRequests.revisionCount} + 1`, updatedAt: new Date() }).where(eq(artRequests.id, artReq.id));
    }
  }

  // For a meeting request, surface the order owner's self-serve booking link.
  let bookingUrl: string | undefined;
  if (status === "meeting_requested") {
    const ownerId = proof.requestedBy ?? order?.createdBy ?? null;
    if (ownerId) {
      const prof = await db.query.schedulingProfiles.findFirst({ where: eq(schedulingProfiles.userId, ownerId) });
      if (prof) bookingUrl = `/schedule/${prof.slug}`;
    }
  }

  await audit({ userId: null, action: "proof.decision", entityType: "order", entityId: proof.orderId, metadata: { status, signedName } });
  revalidatePath(`/proof/${token}`);
  if (order) revalidatePath(`/track/${order.publicToken}`);
  return { done: true, bookingUrl };
}
