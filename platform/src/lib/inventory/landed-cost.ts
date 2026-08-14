import "server-only";
import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { landedCostLines, landedCostDocs } from "@/db/schema";

export interface AllocInput {
  qty: number;
  baseUnitCost: number;
}
export interface AllocResult {
  allocated: number; // freight + other allocated to the line
  landedUnitCost: number; // baseUnitCost + allocated/qty
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

/**
 * Spread `charges` (freight + other) across lines by quantity or extended value.
 * Pure — the worksheet preview and the apply step share it so they agree. The
 * last line absorbs any rounding remainder so the allocation sums exactly.
 */
export function allocateLanded(lines: AllocInput[], charges: number, basis: "quantity" | "value"): AllocResult[] {
  const totalQty = lines.reduce((s, l) => s + (l.qty || 0), 0);
  const totalVal = lines.reduce((s, l) => s + (l.qty || 0) * (l.baseUnitCost || 0), 0);
  const denom = basis === "value" ? totalVal : totalQty;
  const out: AllocResult[] = [];
  let running = 0;
  lines.forEach((l, i) => {
    const weight = denom > 0 ? (basis === "value" ? (l.qty || 0) * (l.baseUnitCost || 0) : (l.qty || 0)) / denom : 0;
    let allocated = i === lines.length - 1 ? round2(charges - running) : round2(charges * weight);
    if (!Number.isFinite(allocated)) allocated = 0;
    running += allocated;
    const landedUnitCost = l.qty > 0 ? round4((l.baseUnitCost || 0) + allocated / l.qty) : round4(l.baseUnitCost || 0);
    out.push({ allocated, landedUnitCost });
  });
  return out;
}

/** Weighted rolling landed average for an item over a trailing window, plus the
 *  prior window for a year-over-year comparison. Uses APPLIED landed-cost lines
 *  (avoids the "average back to 2008" problem — default 365-day window). */
export async function rollingLandedAverage(itemId: string, windowDays = 365): Promise<{ current: number | null; priorYear: number | null; qtyCurrent: number }> {
  const now = new Date();
  const winStart = new Date(now.getTime() - windowDays * 86_400_000);
  const priorStart = new Date(now.getTime() - 2 * windowDays * 86_400_000);

  async function wavg(from: Date, to: Date) {
    const rows = await db
      .select({ q: landedCostLines.qty, c: landedCostLines.landedUnitCost })
      .from(landedCostLines)
      .innerJoin(landedCostDocs, eq(landedCostDocs.id, landedCostLines.docId))
      .where(and(eq(landedCostLines.itemId, itemId), eq(landedCostDocs.status, "applied"), gte(landedCostDocs.appliedAt, from), lt(landedCostDocs.appliedAt, to)));
    let q = 0, v = 0;
    for (const r of rows) { const qty = Number(r.q); q += qty; v += qty * Number(r.c); }
    return { avg: q > 0 ? round4(v / q) : null, qty: q };
  }
  const cur = await wavg(winStart, now);
  const prior = await wavg(priorStart, winStart);
  return { current: cur.avg, priorYear: prior.avg, qtyCurrent: cur.qty };
}

/** Next LC-##### document number (own number series). */
export async function nextLandedNumber(): Promise<string> {
  const { numberSeries } = await import("@/db/schema");
  return db.transaction(async (tx) => {
    let s = await tx.query.numberSeries.findFirst({ where: eq(numberSeries.documentType, "landed_cost") });
    if (!s) [s] = await tx.insert(numberSeries).values({ documentType: "landed_cost", prefix: "LC-", nextNumber: 1, padding: 5 }).returning();
    const n = s.nextNumber;
    await tx.update(numberSeries).set({ nextNumber: n + 1, updatedAt: new Date() }).where(eq(numberSeries.id, s.id));
    return `${s.prefix}${String(n).padStart(s.padding, "0")}`;
  });
}
