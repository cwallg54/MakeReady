import "server-only";
import { db } from "@/db";
import { storeSettings, type StoreSettings } from "@/db/schema";

/** The single storefront settings row, created with defaults on first read.
 *  Deterministic order (by id) so every caller reads the same row even if a
 *  first-write race ever created more than one. */
export async function getStoreSettings(): Promise<StoreSettings> {
  const existing = await db.query.storeSettings.findFirst({ orderBy: (t, { asc }) => [asc(t.id)] });
  if (existing) return existing;
  const [created] = await db.insert(storeSettings).values({}).returning();
  return created;
}
