"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, orderEvents, activities } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView, canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";
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
