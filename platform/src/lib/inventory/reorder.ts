import "server-only";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { inventoryItems, stockMovements, notifications, userRoles } from "@/db/schema";

const WINDOW_DAYS = 365;
// Don't re-alert the same item more often than this (days).
const REALERT_AFTER_DAYS = 10;

export type InventoryItem = typeof inventoryItems.$inferSelect;

export interface ReorderRow {
  item: InventoryItem;
  consumed: number;   // units consumed over the trailing window
  avgDaily: number;
  onHand: number;
  lead: number;       // lead-time days
  daysOfStock: number; // Infinity when there's no usage history
  suggested: number;  // suggested order qty ≈ lead-time usage − on hand
  reason: "low" | "forecast"; // at/below reorder point now, vs. will run short within lead time
}

/** Items that need reordering: at/below their reorder point now, or forecast to
 *  run out within their lead time based on the trailing year of consumption.
 *  Single source of truth for the forecast page and the reorder-alert cron. */
export async function computeReorders(now = new Date()): Promise<ReorderRow[]> {
  const cutoff = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);
  const usageRows = await db
    .select({ itemId: stockMovements.itemId, consumed: sql<string>`COALESCE(SUM(-${stockMovements.delta}), 0)` })
    .from(stockMovements)
    .where(and(eq(stockMovements.reason, "consume"), gte(stockMovements.createdAt, cutoff)))
    .groupBy(stockMovements.itemId);
  const consumedBy = new Map(usageRows.map((r) => [r.itemId, Number(r.consumed)]));

  const items = await db.select().from(inventoryItems).where(eq(inventoryItems.active, true));

  const rows: ReorderRow[] = [];
  for (const item of items) {
    const onHand = Number(item.onHand);
    const reorderPoint = Number(item.reorderPoint);
    const consumed = consumedBy.get(item.id) ?? 0;
    const avgDaily = consumed / WINDOW_DAYS;
    const lead = item.leadTimeDays || 30;
    const daysOfStock = avgDaily > 0 ? onHand / avgDaily : Infinity;
    const suggested = Math.max(0, Math.ceil(avgDaily * lead - onHand));

    const lowNow = reorderPoint > 0 && onHand <= reorderPoint;
    const willRunShort = avgDaily > 0 && daysOfStock < lead;
    if (!lowNow && !willRunShort) continue;

    rows.push({ item, consumed, avgDaily, onHand, lead, daysOfStock, suggested, reason: lowNow ? "low" : "forecast" });
  }
  return rows.sort((a, b) => a.daysOfStock - b.daysOfStock);
}

/** Raise a notification for each item that newly needs reordering. Deduped via
 *  inventory_items.reorder_alert_at so a persistently-low item isn't re-alerted
 *  every day. Called from the daily inventory cron. Never throws. */
export async function runReorderAlerts(now = new Date()): Promise<{ scanned: number; alerted: number }> {
  const rows = await computeReorders(now);
  const staleCutoff = new Date(now.getTime() - REALERT_AFTER_DAYS * 86_400_000);
  const due = rows.filter((r) => !r.item.reorderAlertAt || r.item.reorderAlertAt < staleCutoff);
  if (!due.length) return { scanned: rows.length, alerted: 0 };

  // Purchasing is handled by admins / sales managers today (a dedicated
  // Purchasing team can be routed here once teams exist).
  const recips = await db
    .select({ id: userRoles.userId })
    .from(userRoles)
    .where(inArray(userRoles.role, ["admin", "sales_manager"]));
  const userIds = Array.from(new Set(recips.map((r) => r.id)));

  for (const r of due) {
    if (userIds.length) {
      const reasonText =
        r.reason === "low"
          ? `On hand ${r.onHand} ${r.item.unit} is at or below the reorder point (${Number(r.item.reorderPoint)}).`
          : `About ${Math.round(r.daysOfStock)} days of stock left against a ${r.lead}-day lead time — won't reorder in time.`;
      const suggestion = r.suggested > 0 ? ` Suggested order: ${r.suggested} ${r.item.unit}.` : "";
      await db.insert(notifications).values(
        userIds.map((uid) => ({
          userId: uid,
          type: "inventory",
          title: `Reorder needed: ${r.item.name}`,
          body: `${reasonText}${suggestion}`,
          link: "/inventory/forecast",
        })),
      );
    }
    await db.update(inventoryItems).set({ reorderAlertAt: now }).where(eq(inventoryItems.id, r.item.id));
  }
  return { scanned: rows.length, alerted: due.length };
}
