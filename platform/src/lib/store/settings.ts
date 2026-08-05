import "server-only";
import { db } from "@/db";
import { storeSettings, type StoreSettings } from "@/db/schema";

/** The single storefront settings row, created with defaults on first read. */
export async function getStoreSettings(): Promise<StoreSettings> {
  const existing = await db.query.storeSettings.findFirst();
  if (existing) return existing;
  const [created] = await db.insert(storeSettings).values({}).returning();
  return created;
}
