"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@/db";
import { orders, orderProofs, activities, notifications } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView, canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";

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

  await db.insert(orderProofs).values({
    orderId,
    attachmentId,
    token: randomBytes(24).toString("hex"),
    title: String(formData.get("title") ?? "").trim() || "Proof",
    message: String(formData.get("message") ?? "").trim() || null,
    requestedBy: user.id,
  });
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (order?.bpId) {
    await db.insert(activities).values({ bpId: order.bpId, userId: user.id, type: "other", isSystem: true, content: `Proof approval requested for order ${order.orderNumber}` });
    revalidatePath(`/crm/${order.bpId}`);
  }
  await audit({ userId: user.id, action: "proof.create", entityType: "order", entityId: orderId });
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
}

/** Public — the customer's Approve / Request changes / Decline decision. */
export async function submitProofDecisionAction(_prev: ProofDecisionState, formData: FormData): Promise<ProofDecisionState> {
  const token = String(formData.get("token") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const signedName = String(formData.get("signedName") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const map: Record<string, "approved" | "changes_requested" | "declined"> = {
    approve: "approved",
    changes: "changes_requested",
    decline: "declined",
  };
  const status = map[decision];
  if (!token || !status) return { error: "Please choose an option." };
  if (!signedName) return { error: "Please type your name to sign." };
  if (status !== "approved" && !notes) return { error: "Please tell us what needs to change." };

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
  const label = status === "approved" ? "approved" : status === "changes_requested" ? "requested changes on" : "declined";
  if (proof.requestedBy) {
    await db.insert(notifications).values({
      userId: proof.requestedBy,
      type: "proof",
      title: `Proof ${label}`,
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
  await audit({ userId: null, action: "proof.decision", entityType: "order", entityId: proof.orderId, metadata: { status, signedName } });
  revalidatePath(`/proof/${token}`);
  return { done: true };
}
