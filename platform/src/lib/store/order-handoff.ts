import "server-only";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@/db";
import {
  orders, orderEvents, orderSpecItems, storeOrders, storeOrderItems, storeCustomers,
  businessPartners, activities, invoices, invoiceLines, numberSeries, type StoreOrder,
} from "@/db/schema";
import { nextSalesOrderNumber } from "@/lib/sales/order-from-quote";
import { audit } from "@/lib/audit";

async function nextInvoiceNumber(): Promise<string> {
  return db.transaction(async (tx) => {
    let s = await tx.query.numberSeries.findFirst({ where: eq(numberSeries.documentType, "invoice") });
    if (!s) [s] = await tx.insert(numberSeries).values({ documentType: "invoice", prefix: "INV-", nextNumber: 1, padding: 5 }).returning();
    const n = s.nextNumber;
    await tx.update(numberSeries).set({ nextNumber: n + 1, updatedAt: new Date() }).where(eq(numberSeries.id, s.id));
    return `${s.prefix}${String(n).padStart(s.padding, "0")}`;
  });
}

/** Draft an AR invoice from a store order (linked to its sales order). Only for
 *  accounts (a Business Partner); returns null for guests or if one exists. */
async function createInvoiceForStoreOrder(storeOrder: StoreOrder, salesOrderId: string, bpId: string, byUserId: string | null): Promise<string | null> {
  const existing = await db.query.invoices.findFirst({ where: eq(invoices.orderId, salesOrderId), columns: { id: true } });
  if (existing) return existing.id;
  const bp = await db.query.businessPartners.findFirst({ where: eq(businessPartners.id, bpId), columns: { paymentTerms: true } });
  const invoiceNumber = await nextInvoiceNumber();
  const [inv] = await db.insert(invoices).values({
    invoiceNumber, bpId, orderId: salesOrderId,
    terms: bp?.paymentTerms ?? "Net 30",
    subtotal: storeOrder.subtotal ?? "0",
    discount: storeOrder.discount ?? "0",
    total: storeOrder.total ?? "0",
    notes: `Web store order ${storeOrder.orderNumber}${storeOrder.promoCode ? ` · promo ${storeOrder.promoCode}` : ""}`,
    createdBy: byUserId,
  }).returning({ id: invoices.id });
  const lines = await db.select().from(storeOrderItems).where(eq(storeOrderItems.orderId, storeOrder.id));
  if (lines.length) {
    await db.insert(invoiceLines).values(lines.map((l, i) => ({ invoiceId: inv.id, description: l.title, qty: l.qty, unitPrice: l.unitPrice, extended: l.lineTotal, sortOrder: i })));
  }
  await audit({ userId: byUserId, action: "invoice.create_from_store_order", entityType: "invoice", entityId: inv.id, metadata: { invoiceNumber, storeOrder: storeOrder.orderNumber } });
  return inv.id;
}

/**
 * Turn a confirmed store order into a real ops sales order so it flows through
 * production and Accounts Receivable. Idempotent — returns the existing sales
 * order id if this store order already spawned one. Store items are stock, so
 * each line becomes a simple "Stock item" spec row (no decoration).
 */
export async function createSalesOrderFromStoreOrder(storeOrder: StoreOrder, byUserId: string | null, opts?: { autoInvoice?: boolean }): Promise<string | null> {
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

  // Optionally draft an AR invoice (accounts only — guests have no BP).
  if (opts?.autoInvoice && bpId) {
    try { await createInvoiceForStoreOrder(storeOrder, o.id, bpId, byUserId); }
    catch (e) { console.error("store auto-invoice failed", e); }
  }
  return o.id;
}
