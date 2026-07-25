"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { and } from "drizzle-orm";
import { orders, orderEvents, orderArtifacts, activities, businessPartners, contacts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView, canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { sendOrderEmail } from "@/lib/email";
import { generateOrderPdf } from "./pdf";
import { ORDER_STAGES, type OrderStage } from "./stages";

async function requireSalesEdit() {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "sales")) redirect("/403");
  if (!canEdit(user.roles, "sales")) redirect("/403");
  return user;
}

export async function setOrderStageAction(formData: FormData): Promise<void> {
  const user = await requireSalesEdit();
  const id = String(formData.get("id") ?? "");
  const stage = String(formData.get("stage") ?? "") as OrderStage;
  if (!id || !ORDER_STAGES.some((s) => s.key === stage)) return;

  const order = await db.query.orders.findFirst({ where: eq(orders.id, id) });
  if (!order) return;

  await db.update(orders).set({ stage, updatedAt: new Date() }).where(eq(orders.id, id));
  await db.insert(orderEvents).values({ orderId: id, stage, byUserId: user.id });
  if (order.bpId) {
    const label = ORDER_STAGES.find((s) => s.key === stage)?.label ?? stage;
    await db.insert(activities).values({ bpId: order.bpId, type: "other", isSystem: true, content: `Order ${order.orderNumber} → ${label}` });
    revalidatePath(`/crm/${order.bpId}`);
  }
  await audit({ userId: user.id, action: "order.stage", entityType: "order", entityId: id, metadata: { stage } });
  revalidatePath(`/sales/orders/${id}`);
  revalidatePath("/sales/orders");
}

/** Generate the sales-order PDF, save it as an artifact, and email it to the customer. Used for send and resend. */
export async function emailOrderPdfAction(formData: FormData): Promise<void> {
  const user = await requireSalesEdit();
  const id = String(formData.get("id") ?? "");
  const order = await db.query.orders.findFirst({ where: eq(orders.id, id) });
  if (!order) return;

  const pdf = await generateOrderPdf(id);
  if (!pdf) return;

  // Resolve customer email.
  const bp = order.bpId ? await db.query.businessPartners.findFirst({ where: eq(businessPartners.id, order.bpId) }) : undefined;
  const contact = order.bpId ? await db.query.contacts.findFirst({ where: and(eq(contacts.bpId, order.bpId), eq(contacts.isPrimary, true)) }) : undefined;
  const to = contact?.email ?? bp?.email ?? "";

  let status: "sent" | "queued" | "saved" = "saved";
  if (to) {
    const sent = await sendOrderEmail(to, order.orderNumber, pdf.base64, pdf.filename);
    status = sent ? "sent" : "queued"; // queued = email provider not yet live
  }

  await db.insert(orderArtifacts).values({
    orderId: id,
    filename: pdf.filename,
    contentBase64: pdf.base64,
    sentTo: to || null,
    sentAt: to ? new Date() : null,
    sendStatus: status,
    createdBy: user.id,
  });
  if (order.bpId) {
    const msg = status === "sent" ? `Sales order ${order.orderNumber} PDF emailed to ${to}` : to ? `Sales order ${order.orderNumber} PDF queued for ${to} (email not yet live)` : `Sales order ${order.orderNumber} PDF generated (no customer email on file)`;
    await db.insert(activities).values({ bpId: order.bpId, userId: user.id, type: "email", isSystem: true, content: msg });
    revalidatePath(`/crm/${order.bpId}`);
  }
  await audit({ userId: user.id, action: "order.email_pdf", entityType: "order", entityId: id, metadata: { to, status } });
  revalidatePath(`/sales/orders/${id}`);
}
