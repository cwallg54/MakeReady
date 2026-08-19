"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contentAssets, contentCollections, contentUsage } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView, canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { nextDocNumber } from "@/lib/number-series";
import { aiVision } from "@/lib/ai/client";
import { embedAsset, removeAssetEmbedding } from "./embeddings";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB (base64-in-DB MVP; external storage is the production path for 500 MB)
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;
const VISION_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

async function requireContentEdit() {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "content_library") || !canEdit(user.roles, "content_library")) redirect("/403");
  return user;
}

function kindFor(mime: string): string {
  if (mime.startsWith("image/")) return mime.includes("svg") ? "vector" : "image";
  if (mime === "application/pdf" || mime.startsWith("text/")) return "document";
  if (mime.includes("eps") || mime.includes("postscript") || mime.includes("illustrator")) return "vector";
  return "other";
}

/** AI-generate a short description + tags from an image. Best-effort. */
async function autoTag(base64: string, mime: string): Promise<{ description: string | null; tags: string[] }> {
  if (!VISION_TYPES.has(mime)) return { description: null, tags: [] };
  try {
    const res = await aiVision({
      imageBase64: base64, mediaType: mime, maxTokens: 300,
      system: "You tag graphic assets for a screen-printing shop's digital asset library. Reply with a single line: a concise visual description, then a pipe |, then 5-12 comma-separated lowercase tags (subjects, style, colors, themes). No other text.",
      prompt: "Describe and tag this asset for search.",
    });
    if (!res.ok || !res.text) return { description: null, tags: [] };
    const [descPart, tagPart] = res.text.split("|");
    const description = (descPart ?? "").trim() || null;
    const tags = (tagPart ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 12);
    return { description, tags };
  } catch {
    return { description: null, tags: [] };
  }
}

export async function uploadAssetAction(formData: FormData): Promise<void> {
  const user = await requireContentEdit();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) redirect("/content-library?err=nofile");
  if (file.size > MAX_BYTES) redirect("/content-library?err=toobig");
  const f = file as File;

  const buf = Buffer.from(await f.arrayBuffer());
  const base64 = buf.toString("base64");
  const mime = f.type || "application/octet-stream";
  const assetNumber = await nextDocNumber("content_asset", "CA-");

  // AI description + tags (images only, when configured); manual title/tags win.
  const auto = await autoTag(base64, mime);
  const manualTags = (str(formData.get("tags")) ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
  const tags = Array.from(new Set([...manualTags, ...auto.tags]));
  const title = str(formData.get("title")) ?? f.name.replace(/\.[^.]+$/, "");
  const description = str(formData.get("description")) ?? auto.description;

  const [a] = await db.insert(contentAssets).values({
    assetNumber, title, description,
    fileName: f.name, mimeType: mime, sizeBytes: f.size, kind: kindFor(mime),
    contentBase64: base64,
    thumbnailBase64: mime.startsWith("image/") && !mime.includes("svg") ? base64 : null, // reuse original as preview (MVP)
    tags: tags.length ? tags : null,
    collectionId: str(formData.get("collectionId")),
    clientBpId: str(formData.get("clientBpId")),
    usageRights: str(formData.get("usageRights")) ?? "internal",
    rightsNote: str(formData.get("rightsNote")),
    aiTagged: auto.tags.length > 0 || !!auto.description,
    uploadedBy: user.id,
  }).returning({ id: contentAssets.id });

  // Embed for semantic/visual search (best-effort; graceful when unconfigured).
  const embedText = [title, description, tags.join(" ")].filter(Boolean).join(". ");
  const embedded = await embedAsset(a.id, embedText);
  if (embedded) await db.update(contentAssets).set({ embedded: true }).where(eq(contentAssets.id, a.id));

  await audit({ userId: user.id, action: "content.upload", entityType: "content_asset", entityId: a.id, metadata: { aiTagged: auto.tags.length > 0 } });
  redirect(`/content-library/${a.id}`);
}

export async function updateAssetAction(formData: FormData): Promise<void> {
  const user = await requireContentEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const tags = (str(formData.get("tags")) ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
  const title = str(formData.get("title")) ?? "Untitled";
  const description = str(formData.get("description"));
  await db.update(contentAssets).set({
    title, description, tags: tags.length ? tags : null,
    collectionId: str(formData.get("collectionId")),
    clientBpId: str(formData.get("clientBpId")),
    usageRights: str(formData.get("usageRights")) ?? "internal",
    rightsNote: str(formData.get("rightsNote")),
    updatedAt: new Date(),
  }).where(eq(contentAssets.id, id));
  // Re-embed on metadata change so search stays fresh.
  await embedAsset(id, [title, description, tags.join(" ")].filter(Boolean).join(". "));
  await audit({ userId: user.id, action: "content.update", entityType: "content_asset", entityId: id });
  revalidatePath(`/content-library/${id}`);
}

export async function deleteAssetAction(formData: FormData): Promise<void> {
  const user = await requireContentEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.delete(contentAssets).where(eq(contentAssets.id, id));
  await removeAssetEmbedding(id);
  await audit({ userId: user.id, action: "content.delete", entityType: "content_asset", entityId: id });
  redirect("/content-library");
}

export async function createCollectionAction(formData: FormData): Promise<void> {
  const user = await requireContentEdit();
  await db.insert(contentCollections).values({
    name: str(formData.get("name")) ?? "New collection",
    description: str(formData.get("description")),
    createdBy: user.id,
  });
  await audit({ userId: user.id, action: "content.collection_create", entityType: "content_collection" });
  revalidatePath("/content-library");
}

export async function logUsageAction(formData: FormData): Promise<void> {
  const user = await requireContentEdit();
  const assetId = String(formData.get("assetId") ?? "");
  if (!assetId) return;
  await db.insert(contentUsage).values({ assetId, context: str(formData.get("context")), userId: user.id });
  await audit({ userId: user.id, action: "content.usage_log", entityType: "content_asset", entityId: assetId });
  revalidatePath(`/content-library/${assetId}`);
}
