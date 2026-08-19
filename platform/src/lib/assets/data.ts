import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { fixedAssets, depreciationRuns, depreciationLines } from "@/db/schema";
import { assetCalc } from "./depreciation";

export async function listAssets() {
  const rows = await db.select().from(fixedAssets).orderBy(desc(fixedAssets.createdAt));
  return rows.map((a) => ({ ...a, calc: assetCalc(a) }));
}

export async function assetSummary() {
  const rows = await db.select().from(fixedAssets);
  let cost = 0, accum = 0, activeCount = 0, disposedCount = 0;
  for (const a of rows) {
    if (a.status === "disposed") { disposedCount++; continue; }
    cost += Number(a.cost);
    accum += Number(a.accumulatedDepreciation);
    activeCount++;
  }
  return { cost, accum, nbv: Math.round((cost - accum) * 100) / 100, activeCount, disposedCount, total: rows.length };
}

export async function getAsset(id: string) {
  const asset = await db.query.fixedAssets.findFirst({ where: eq(fixedAssets.id, id) });
  if (!asset) return null;
  const runs = await db
    .select({ id: depreciationLines.id, amount: depreciationLines.amount, periodYm: depreciationRuns.periodYm, runNumber: depreciationRuns.runNumber, postedAt: depreciationRuns.postedAt })
    .from(depreciationLines)
    .innerJoin(depreciationRuns, eq(depreciationRuns.id, depreciationLines.runId))
    .where(eq(depreciationLines.assetId, id))
    .orderBy(desc(depreciationRuns.periodYm));
  return { asset, calc: assetCalc(asset), history: runs };
}

export async function listDepreciationRuns() {
  return db.select().from(depreciationRuns).orderBy(desc(depreciationRuns.periodYm));
}
