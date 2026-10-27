import "server-only";
import sharp from "sharp";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orderAttachments } from "@/db/schema";
import { azureConfigured, uploadShareFile, readShareFile, fileSasUrl } from "@/lib/content/azure";

/**
 * Art files (customer art, mockups, references, proofs, production photos).
 *
 * The original goes to Azure Files when it's configured — the same share the
 * Content Library uses, under AZURE_ART_ROOT — and only its path is kept in
 * Neon. Without Azure the original stays in the row as before. Either way two
 * small WebP renditions are stored with the row, and every page shows those:
 *
 *   thumb    ~400px  — tiles and lists
 *   preview  ~1600px — the default view, proofs
 *   full     the original, only on request; from Azure it is a short-lived
 *            link the browser downloads directly, so it never passes through
 *            the app or the database.
 */
export type ArtSize = "thumb" | "preview" | "full";

const PREVIEW_MAX = 1600;
const THUMB_MAX = 400;
// Raster formats sharp can read. PSD/AI/EPS/PDF have no rendition and always serve the original.
const RASTER = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/tiff", "image/bmp", "image/avif"]);

function artRoot(): string {
  return (process.env.AZURE_ART_ROOT ?? "MakeReady/Art").replace(/^\/+|\/+$/g, "");
}

function safeName(filename: string): string {
  return filename.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 120) || "file";
}

async function renditions(bytes: Buffer, mimeType: string): Promise<{ preview: string | null; thumb: string | null }> {
  if (!RASTER.has(mimeType.toLowerCase())) return { preview: null, thumb: null };
  try {
    const img = sharp(bytes, { failOn: "none" }).rotate();
    const [preview, thumb] = await Promise.all([
      img.clone().resize(PREVIEW_MAX, PREVIEW_MAX, { fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer(),
      img.clone().resize(THUMB_MAX, THUMB_MAX, { fit: "inside", withoutEnlargement: true }).webp({ quality: 70 }).toBuffer(),
    ]);
    return { preview: preview.toString("base64"), thumb: thumb.toString("base64") };
  } catch {
    return { preview: null, thumb: null };
  }
}

/**
 * The storage columns for a new order_attachments row. `folder` groups files on
 * the share, e.g. `orders/<orderId>`.
 */
export async function artFileColumns(input: { bytes: Buffer; mimeType: string; filename: string; folder: string }) {
  const { preview, thumb } = await renditions(input.bytes, input.mimeType);
  if (azureConfigured()) {
    const path = `${artRoot()}/${input.folder}/${randomUUID().slice(0, 8)}-${safeName(input.filename)}`;
    if (await uploadShareFile(path, input.bytes, input.mimeType)) {
      return { storageProvider: "azure_files", storagePath: path, contentBase64: null, previewBase64: preview, thumbBase64: thumb };
    }
    // Upload failed: keep the file in the database rather than lose it.
  }
  return { storageProvider: "db", storagePath: null, contentBase64: input.bytes.toString("base64"), previewBase64: preview, thumbBase64: thumb };
}

type ArtRow = typeof orderAttachments.$inferSelect;

/** Everything about an attachment except its bytes — for lists, so a page never pulls the files themselves out of Neon. */
export const artFileListColumns = {
  id: orderAttachments.id,
  orderId: orderAttachments.orderId,
  filename: orderAttachments.filename,
  mimeType: orderAttachments.mimeType,
  sizeBytes: orderAttachments.sizeBytes,
  kind: orderAttachments.kind,
  storageProvider: orderAttachments.storageProvider,
  notes: orderAttachments.notes,
  uploadedBy: orderAttachments.uploadedBy,
  createdAt: orderAttachments.createdAt,
};

/** The original bytes, wherever they live. */
export async function readArtBytes(a: Pick<ArtRow, "storageProvider" | "storagePath" | "contentBase64">): Promise<Buffer | null> {
  if (a.storageProvider === "azure_files" && a.storagePath) return readShareFile(a.storagePath);
  return a.contentBase64 ? Buffer.from(a.contentBase64, "base64") : null;
}

/**
 * Serve an art file at the requested size. Renditions are immutable per row, so
 * the browser caches them for a year. Rows saved before renditions existed get
 * them made on first view and stored, so each file is only processed once.
 */
export async function serveArtFile(a: ArtRow, size: ArtSize, opts: { inlineOnly?: boolean } = {}): Promise<Response> {
  if (size !== "full" && RASTER.has(a.mimeType.toLowerCase())) {
    let b64 = size === "thumb" ? a.thumbBase64 : a.previewBase64;
    if (!b64) {
      const bytes = await readArtBytes(a);
      if (bytes) {
        const r = await renditions(bytes, a.mimeType);
        if (r.preview && r.thumb) {
          await db.update(orderAttachments).set({ previewBase64: r.preview, thumbBase64: r.thumb }).where(eq(orderAttachments.id, a.id));
          b64 = size === "thumb" ? r.thumb : r.preview;
        }
      }
    }
    if (b64) {
      return new Response(Buffer.from(b64, "base64"), {
        headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=31536000, immutable" },
      });
    }
  }

  // The original.
  if (a.storageProvider === "azure_files" && a.storagePath) {
    const url = fileSasUrl(a.storagePath, 30);
    if (url) return Response.redirect(url, 302);
  }
  const bytes = await readArtBytes(a);
  if (!bytes) return new Response("File not available", { status: 404 });
  const inline = opts.inlineOnly || a.mimeType.startsWith("image/") || a.mimeType === "application/pdf";
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": a.mimeType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${a.filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

/** `?size=thumb|preview|full`; anything else is the preview. */
export function sizeParam(req: Request): ArtSize {
  const s = new URL(req.url).searchParams.get("size");
  return s === "thumb" || s === "full" ? s : "preview";
}
