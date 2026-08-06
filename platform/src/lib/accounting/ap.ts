import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bills, billLines, billPayments } from "@/db/schema";

/** Recompute a bill's stored subtotal/total from its lines. */
export async function recomputeBillTotals(billId: string): Promise<void> {
  const [row] = await db.select({ subtotal: sql<string>`COALESCE(SUM(${billLines.extended}),0)` }).from(billLines).where(eq(billLines.billId, billId));
  const subtotal = Number(row?.subtotal ?? 0);
  await db.update(bills).set({ subtotal: subtotal.toFixed(2), total: subtotal.toFixed(2), updatedAt: new Date() }).where(eq(bills.id, billId));
}

export async function billPaid(billId: string): Promise<number> {
  const [row] = await db.select({ s: sql<string>`COALESCE(SUM(${billPayments.amount}),0)` }).from(billPayments).where(eq(billPayments.billId, billId));
  return Number(row?.s ?? 0);
}

/** Recompute an issued bill's status (open → partial → paid) from its payments. */
export async function refreshBill(billId: string): Promise<void> {
  const bill = await db.query.bills.findFirst({ where: eq(bills.id, billId) });
  if (!bill || bill.voidedAt || bill.status === "draft" || bill.status === "void") return;
  const paid = await billPaid(billId);
  const total = Number(bill.total);
  const status = paid <= 0.005 ? "open" : paid + 0.005 >= total ? "paid" : "partial";
  if (status !== bill.status) await db.update(bills).set({ status, updatedAt: new Date() }).where(eq(bills.id, billId));
}
