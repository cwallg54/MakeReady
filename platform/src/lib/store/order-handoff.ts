import "server-only";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@/db";
import {
  orders, orderEvents, orderSpecItems, storeOrders, storeOrderItems, storeCustomers,
  businessPartners, activities, type StoreOrder,
} from "@/db/schema";
import { nextSalesOrderNumber } from "@/lib/sales/order-from-quote";
import { audit } from "@/lib/audit";

/**
 * Turn a confirmed store order into a real ops sales order so it flows through
 * production and Accounts Receivable. Idempotent — returns the existing sales
 * order id if this store order already spawned one. Store items are stock, so
 * each line becomes a simple "Stock item" spec row (no decoration).
 */
export async function createSalesOrderFromStoreOrder(storeOrder: StoreOrder, byUserId: string | null): Promise<string | null> {
  if (storeOrder.salesOrderId) return storeOrder.salesOrderId;

  // Resolve the CRM account: the store customer's linked Business Partner.
  let bpId: string | null = null;
  let repId: string | null = byUserId;
  if (storeOrder.customerId) {
    const cust = await db.query.storeCustomers.findFirst({ where: eq(storeCustomers.id, storeOrder.customerId), columns: { bpId: true } });
    bpId = cust?.bpId ?? null;
    if (bpId) {
      const bp = await db.query.businessPartners.findFirst({ where: eq(businessPartners.id, bpId), columns: { ownerId: true } });
      repId = bp?.ownerId ?? byUserId;
    }
  }

  const orderNumber = await nextSalesOrderNumber();
  const publicToken = randomBytes(16).toString("hex");
  const [o] = await db.insert(orders).values({
    orderNumber,
    bpId,
    publicToken,
    stage: "received",
    orderType: "BLASG", // blank/stock goods — no decoration
    createdBy: byUserId,
    amount: storeOrder.total ?? "0",
    salesRepId: repId,
    notes: `Web store order ${storeOrder.orderNumber}${storeOrder.contactName ? ` · ${storeOrder.contactName}` : ""}${storeOrder.shippingAddress ? `\nShip to: ${storeOrder.shippingAddress}` : ""}`,
  }).returning({ id: orders.id });

  await db.insert(orderEvents).values({ orderId: o.id, stage: "received", byUserId, note: `From web store order ${storeOrder.orderNumber}` });

  const lines = await db.select().from(storeOrderItems).where(eq(storeOrderItems.orderId, storeOrder.id));
  if (lines.length) {
    await db.insert(orderSpecItems).values(lines.map((l, i) => ({
      orderId: o.id,
      product: l.title,
      decorationMethod: "Stock item (web store)",
      sizeBreakdown: `Qty: ${l.qty}`,
      notes: l.sku ?? null,
      sortOrder: i,
    })));
  }

  if (bpId) {
    await db.insert(activities).values({ bpId, userId: byUserId, type: "other", isSystem: true, content: `Sales order ${orderNumber} created from web store order ${storeOrder.orderNumber}` });
  }
  await audit({ userId: byUserId, action: "store.order_to_sales_order", entityType: "order", entityId: o.id, metadata: { orderNumber, storeOrder: storeOrder.orderNumber } });
  return o.id;
}
