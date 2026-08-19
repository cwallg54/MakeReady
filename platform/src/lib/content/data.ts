import "server-only";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { contentAssets, contentCollections, contentUsage, businessPartners, users, orders } from "@/db/schema";
import { semanticSearch, similarAssets } from "./embeddings";

export interface AssetCard {
  id: string; assetNumber: string; title: string; kind: string; mimeType: string;
  tags: string[] | null; hasThumb: boolean; collectionId: string | null; usageRights: string;
}

const toCard = (a: typeof contentAssets.$inferSelect): AssetCard => ({
  id: a.id, assetNumber: a.assetNumber, title: a.title, kind: a.kind, mimeType: a.mimeType,
  tags: a.tags, hasThumb: !!a.thumbnailBase64, collectionId: a.collectionId, usageRights: a.usageRights,
});

/** Browse/search assets. Natural-language search first tries vector search, then
 *  unions keyword matches on title/description/tags. */
export async function searchAssets(opts: { q?: string; collectionId?: string; clientBpId?: string; limit?: number }): Promise<AssetCard[]> {
  const { q, collectionId, clientBpId, limit = 60 } = opts;
  const filters = [];
  if (collectionId) filters.push(eq(contentAssets.collectionId, collectionId));
  if (clientBpId) filters.push(eq(contentAssets.clientBpId, clientBpId));

  if (q && q.trim()) {
    const semIds = await semanticSearch(q, 40);
    const like = `%${q.trim()}%`;
    const kw = await db.select().from(contentAssets)
      .where(and(or(ilike(contentAssets.title, like), ilike(contentAssets.description, like), sql`${contentAssets.tags} && ARRAY[${q.trim().toLowerCase()}]::text[]`, sql`EXISTS (SELECT 1 FROM unnest(${contentAssets.tags}) tag WHERE tag ILIKE ${like})`), ...filters))
      .limit(limit);
    // Merge: semantic hits first (in order), then keyword hits not already present.
    const order = new Map<string, number>();
    semIds.forEach((id, i) => order.set(id, i));
    let semAssets: typeof kw = [];
    if (semIds.length) {
      const rows = await db.select().from(contentAssets).where(and(inArray(contentAssets.id, semIds), ...filters));
      semAssets = rows.sort((a, b) => (order.get(a.id)! - order.get(b.id)!));
    }
    const seen = new Set(semAssets.map((a) => a.id));
    const merged = [...semAssets, ...kw.filter((a) => !seen.has(a.id))].slice(0, limit);
    return merged.map(toCard);
  }

  const rows = await db.select().from(contentAssets).where(filters.length ? and(...filters) : undefined).orderBy(desc(contentAssets.createdAt)).limit(limit);
  return rows.map(toCard);
}

export async function listCollections() {
  const rows = await db
    .select({ id: contentCollections.id, name: contentCollections.name, description: contentCollections.description, n: sql<string>`(SELECT COUNT(*) FROM ${contentAssets} WHERE ${contentAssets.collectionId} = ${contentCollections.id})` })
    .from(contentCollections).orderBy(contentCollections.name);
  return rows.map((r) => ({ ...r, count: Number(r.n) }));
}

export async function assetCount() {
  const [row] = await db.select({ n: sql<string>`COUNT(*)` }).from(contentAssets);
  return Number(row?.n ?? 0);
}

export async function getAsset(id: string) {
  const asset = await db.query.contentAssets.findFirst({ where: eq(contentAssets.id, id) });
  if (!asset) return null;
  const [collection, client, usage, collections, similarIds] = await Promise.all([
    asset.collectionId ? db.query.contentCollections.findFirst({ where: eq(contentCollections.id, asset.collectionId), columns: { name: true } }) : null,
    asset.clientBpId ? db.query.businessPartners.findFirst({ where: eq(businessPartners.id, asset.clientBpId), columns: { companyName: true } }) : null,
    db.select({ id: contentUsage.id, context: contentUsage.context, createdAt: contentUsage.createdAt, user: users.name, orderNumber: orders.orderNumber })
      .from(contentUsage).leftJoin(users, eq(users.id, contentUsage.userId)).leftJoin(orders, eq(orders.id, contentUsage.orderId))
      .where(eq(contentUsage.assetId, id)).orderBy(desc(contentUsage.createdAt)),
    db.select().from(contentCollections).orderBy(contentCollections.name),
    similarAssets(id, 8),
  ]);
  let similar: AssetCard[] = [];
  if (similarIds.length) {
    const rows = await db.select().from(contentAssets).where(inArray(contentAssets.id, similarIds));
    const order = new Map(similarIds.map((x, i) => [x, i]));
    similar = rows.sort((a, b) => (order.get(a.id)! - order.get(b.id)!)).map(toCard);
  }
  return { asset, collectionName: collection?.name ?? null, clientName: client?.companyName ?? null, usage, collections, similar };
}

export async function assetBytes(id: string, thumb: boolean) {
  const a = await db.query.contentAssets.findFirst({ where: eq(contentAssets.id, id), columns: { contentBase64: true, thumbnailBase64: true, mimeType: true, fileName: true } });
  if (!a) return null;
  const b64 = thumb ? a.thumbnailBase64 : a.contentBase64;
  if (!b64) return null;
  return { buf: Buffer.from(b64, "base64"), mimeType: thumb ? "image/jpeg" : a.mimeType, fileName: a.fileName };
}
