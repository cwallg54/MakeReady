import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { inventoryItems, itemBinStock, stockMovements } from "@/db/schema";

/** on-hand = sum of the item's bin quantities. Keeps inventory_items.onHand in sync. */
export async function recomputeOnHand(itemId: string): Promise<void> {
  const [row] = await db.select({ total: sql<string>`COALESCE(SUM(${itemBinStock.qty}), 0)` }).from(itemBinStock).where(eq(itemBinStock.itemId, itemId));
  await db.update(inventoryItems).set({ onHand: String(row?.total ?? 0), updatedAt: new Date() }).where(eq(inventoryItems.id, itemId));
}

export async function binQty(itemId: string, binId: string): Promise<number> {
  const r = await db.query.itemBinStock.findFirst({ where: and(eq(itemBinStock.itemId, itemId), eq(itemBinStock.binId, binId)) });
  return Number(r?.qty ?? 0);
}

async function setBinQty(itemId: string, binId: string, qty: number): Promise<void> {
  const existing = await db.query.itemBinStock.findFirst({ where: and(eq(itemBinStock.itemId, itemId), eq(itemBinStock.binId, binId)) });
  if (existing) await db.update(itemBinStock).set({ qty: String(qty), updatedAt: new Date() }).where(eq(itemBinStock.id, existing.id));
  else await db.insert(itemBinStock).values({ itemId, binId, qty: String(qty) });
}

/** Post a stock movement to a bin (± delta), record the ledger row, and resync
 *  the item's on-hand. Shared by ad-hoc bin adjustments and the production order. */
export async function postStockMovement(o: {
  itemId: string;
  binId: string;
  delta: number;
  reason: "receive" | "consume" | "adjust" | "count";
  note?: string | null;
  userId?: string | null;
}): Promise<void> {
  const cur = await binQty(o.itemId, o.binId);
  await setBinQty(o.itemId, o.binId, cur + o.delta);
  await db.insert(stockMovements).values({ itemId: o.itemId, binId: o.binId, delta: String(o.delta), reason: o.reason, note: o.note ?? null, byUserId: o.userId ?? null });
  await recomputeOnHand(o.itemId);
}
