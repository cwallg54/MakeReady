import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { voyageConfigured, embedQuery, toVectorLiteral, VOYAGE_MODEL } from "@/lib/ai/voyage";

/**
 * Content-asset embeddings for natural-language and visual-similarity search.
 * Stored in a pgvector table created lazily (like the design library's
 * design_embeddings) so the feature is a graceful enhancement: everything works
 * on keyword/tag search when Voyage/pgvector aren't set up. Every function
 * swallows errors and degrades to null/empty.
 */
const DIM = 1024; // voyage-multimodal-3.5

let ensured = false;
async function ensureTable(): Promise<boolean> {
  if (ensured) return true;
  try {
    await db.execute(sql`create extension if not exists vector`);
    await db.execute(sql.raw(`create table if not exists content_asset_embeddings (
      asset_id uuid primary key,
      embedding vector(${DIM}),
      created_at timestamptz not null default now()
    )`));
    ensured = true;
    return true;
  } catch (e) {
    console.error("[content-embeddings] ensureTable failed", e);
    return false;
  }
}

/** Embed an asset's text (title + description + tags) and store it. Best-effort. */
export async function embedAsset(assetId: string, text: string): Promise<boolean> {
  if (!voyageConfigured() || !text.trim()) return false;
  if (!(await ensureTable())) return false;
  try {
    const vec = await embedQuery(text.slice(0, 4000)); // multimodal model; text input
    if (!vec) return false;
    const lit = toVectorLiteral(vec);
    await db.execute(sql`
      insert into content_asset_embeddings (asset_id, embedding)
      values (${assetId}, ${lit}::vector)
      on conflict (asset_id) do update set embedding = excluded.embedding, created_at = now()`);
    return true;
  } catch (e) {
    console.error("[content-embeddings] embedAsset failed", e);
    return false;
  }
}

export async function removeAssetEmbedding(assetId: string): Promise<void> {
  try {
    if (!ensured) return;
    await db.execute(sql`delete from content_asset_embeddings where asset_id = ${assetId}`);
  } catch { /* ignore */ }
}

/** Natural-language search → asset ids ranked by cosine distance. */
export async function semanticSearch(query: string, limit = 24): Promise<string[]> {
  if (!voyageConfigured() || !query.trim()) return [];
  if (!(await ensureTable())) return [];
  try {
    const vec = await embedQuery(query);
    if (!vec) return [];
    const lit = toVectorLiteral(vec);
    const res = await db.execute(sql`
      select asset_id from content_asset_embeddings
      order by embedding <=> ${lit}::vector
      limit ${limit}`);
    const rows = (res as unknown as { rows?: { asset_id: string }[] }).rows ?? (res as unknown as { asset_id: string }[]);
    return rows.map((r) => r.asset_id);
  } catch (e) {
    console.error("[content-embeddings] semanticSearch failed", e);
    return [];
  }
}

/** Visual-similarity: assets nearest to a given asset's own vector. */
export async function similarAssets(assetId: string, limit = 8): Promise<string[]> {
  if (!(await ensureTable())) return [];
  try {
    const res = await db.execute(sql`
      select e2.asset_id
      from content_asset_embeddings e1
      join content_asset_embeddings e2 on e2.asset_id <> e1.asset_id
      where e1.asset_id = ${assetId}
      order by e1.embedding <=> e2.embedding
      limit ${limit}`);
    const rows = (res as unknown as { rows?: { asset_id: string }[] }).rows ?? (res as unknown as { asset_id: string }[]);
    return rows.map((r) => r.asset_id);
  } catch (e) {
    console.error("[content-embeddings] similarAssets failed", e);
    return [];
  }
}

export function embeddingsAvailable(): boolean {
  return voyageConfigured();
}
export { VOYAGE_MODEL };
