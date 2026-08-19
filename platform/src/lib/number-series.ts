import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { numberSeries } from "@/db/schema";

/**
 * Allocate the next document number for a series (e.g. "FA-00001"), atomically.
 * Pass an active transaction as `runner` when the number must be reserved as
 * part of a larger write; otherwise the default db connection is used.
 *
 * Mirrors the inline pattern used across the accounting/sales modules, factored
 * out so newer modules (assets, quality, maintenance, workflows, content) share
 * one implementation.
 */
export async function nextDocNumber(
  documentType: string,
  prefix: string,
  opts: { padding?: number; start?: number; runner?: typeof db } = {},
): Promise<string> {
  const { padding = 5, start = 1, runner = db } = opts;
  let s = await runner.query.numberSeries.findFirst({ where: eq(numberSeries.documentType, documentType) });
  if (!s) [s] = await runner.insert(numberSeries).values({ documentType, prefix, nextNumber: start, padding }).returning();
  const n = s.nextNumber;
  await runner.update(numberSeries).set({ nextNumber: n + 1, updatedAt: new Date() }).where(eq(numberSeries.id, s.id));
  return `${s.prefix}${String(n).padStart(s.padding, "0")}`;
}
