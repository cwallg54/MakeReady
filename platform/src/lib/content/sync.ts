import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { contentAssets } from "@/db/schema";
import { nextDocNumber } from "@/lib/number-series";
import { azureConfigured, azureShareName, listShareFiles, readShareFile } from "./azure";
import { extOf, mimeForExt, kindForExt, makeThumbnail } from "./thumbnail";
import { embedAsset } from "./embeddings";
import { aiVision } from "@/lib/ai/client";

export interface SyncResult { configured: boolean; found: number; created: number; thumbnailed: number; aiTagged: number; removed: number; remaining: number; error?: string }

// Bounds per run so a huge share is imported over repeated syncs and a single
// request never runs away. Metadata (create rows) is cheap; downloading bytes to
// thumbnail/AI-tag is the expensive part, so those are capped.
const MAX_CREATE_PER_RUN = 500;   // new rows to register per sync
const MAX_DOWNLOAD_PER_RUN = 80;  // files to download for thumbnail/AI per sync
const MAX_AI_PER_RUN = 25;        // AI-vision calls per sync (cost guard)
const MAX_THUMB_BYTES = 40 * 1024 * 1024;
const VISION_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

async function aiTag(base64: string, mime: string): Promise<{ description: string | null; tags: string[] }> {
  if (!VISION_TYPES.has(mime)) return { description: null, tags: [] };
  try {
    const res = await aiVision({
      imageBase64: base64, mediaType: mime, maxTokens: 300,
      system: "You tag graphic assets for a screen-printing shop's digital asset library. Reply with one line: a concise visual description, then a pipe |, then 5-12 comma-separated lowercase tags. No other text.",
      prompt: "Describe and tag this asset for search.",
    });
    if (!res.ok || !res.text) return { description: null, tags: [] };
    const [d, t] = res.text.split("|");
    return { description: (d ?? "").trim() || null, tags: (t ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean).slice(0, 12) };
  } catch {
    return { description: null, tags: [] };
  }
}

/**
 * Index the Azure Files share into the Content Library. Registers new files as
 * asset rows (metadata + storage path only — bytes stay in Azure), generates
 * thumbnails + AI tags for new images (capped per run), embeds text for search,
 * refreshes lastSyncedAt, and removes rows whose file is gone from the share.
 * Idempotent and incremental — safe to run repeatedly (and on a cron).
 */
export async function syncAzureLibrary(userId: string | null): Promise<SyncResult> {
  const base: SyncResult = { configured: azureConfigured(), found: 0, created: 0, thumbnailed: 0, aiTagged: 0, removed: 0, remaining: 0 };
  if (!base.configured) return { ...base, error: "Azure Files is not configured (set AZURE_STORAGE_* and AZURE_FILES_SHARE)." };
  const share = azureShareName()!;

  let files;
  try { files = await listShareFiles(); } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : "Could not list the Azure share." };
  }
  base.found = files.length;

  // Existing azure-backed rows for this share, keyed by path.
  const existing = await db.select({ id: contentAssets.id, storagePath: contentAssets.storagePath })
    .from(contentAssets).where(and(eq(contentAssets.storageProvider, "azure_files"), eq(contentAssets.storageShare, share)));
  const byPath = new Map(existing.map((r) => [r.storagePath, r.id]));
  const seen = new Set<string>();

  const aiConfigured = !!process.env.ANTHROPIC_API_KEY;
  let created = 0, thumbed = 0, tagged = 0, downloaded = 0;

  for (const f of files) {
    seen.add(f.path);
    if (byPath.has(f.path)) continue; // already indexed — leave curation intact
    if (created >= MAX_CREATE_PER_RUN) { base.remaining++; continue; }

    const ext = extOf(f.name);
    const mime = mimeForExt(ext);
    const kind = kindForExt(ext);
    const assetNumber = await nextDocNumber("content_asset", "CA-");

    let thumbnailBase64: string | null = null;
    let description: string | null = null;
    let tags: string[] = [];

    // Download bytes only for images within the size cap, and only up to the
    // per-run budget — to thumbnail and (optionally) AI-tag.
    if (kind === "image" && f.sizeBytes <= MAX_THUMB_BYTES && downloaded < MAX_DOWNLOAD_PER_RUN) {
      const buf = await readShareFile(f.path);
      downloaded++;
      if (buf) {
        thumbnailBase64 = await makeThumbnail(buf, ext);
        if (thumbnailBase64) thumbed++;
        if (aiConfigured && tagged < MAX_AI_PER_RUN && VISION_TYPES.has(mime)) {
          const a = await aiTag(buf.toString("base64"), mime);
          description = a.description; tags = a.tags;
          if (a.tags.length || a.description) tagged++;
        }
      }
    }

    const title = f.name.replace(/\.[^.]+$/, "");
    const [row] = await db.insert(contentAssets).values({
      assetNumber, title, description,
      fileName: f.name, mimeType: mime, sizeBytes: f.sizeBytes, kind,
      storageProvider: "azure_files", storageShare: share, storagePath: f.path,
      contentBase64: null, thumbnailBase64,
      tags: tags.length ? tags : null,
      usageRights: "internal", aiTagged: tags.length > 0 || !!description,
      lastSyncedAt: new Date(), uploadedBy: userId,
    }).returning({ id: contentAssets.id });
    created++;

    const embedText = [title, description, tags.join(" ")].filter(Boolean).join(". ");
    if (embedText.trim()) { const ok = await embedAsset(row.id, embedText); if (ok) await db.update(contentAssets).set({ embedded: true }).where(eq(contentAssets.id, row.id)); }
  }

  // Touch lastSyncedAt on the rows we saw (mark them still-present).
  const seenIds = existing.filter((r) => r.storagePath && seen.has(r.storagePath)).map((r) => r.id);
  if (seenIds.length) {
    for (let i = 0; i < seenIds.length; i += 500) {
      await db.update(contentAssets).set({ lastSyncedAt: new Date() }).where(inArray(contentAssets.id, seenIds.slice(i, i + 500)));
    }
  }

  // Remove rows whose file no longer exists on the share (source of truth).
  const removedIds = existing.filter((r) => r.storagePath && !seen.has(r.storagePath)).map((r) => r.id);
  if (removedIds.length) {
    for (let i = 0; i < removedIds.length; i += 500) {
      await db.delete(contentAssets).where(and(eq(contentAssets.storageProvider, "azure_files"), inArray(contentAssets.id, removedIds.slice(i, i + 500))));
    }
  }

  base.created = created; base.thumbnailed = thumbed; base.aiTagged = tagged; base.removed = removedIds.length;
  return base;
}
