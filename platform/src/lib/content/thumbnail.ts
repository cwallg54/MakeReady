import "server-only";
import sharp from "sharp";

const THUMB_MAX = 480; // px on the long edge

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif", "tif", "tiff", "bmp"]);

export function extOf(nameOrPath: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(nameOrPath);
  return m ? m[1].toLowerCase() : "";
}

export function mimeForExt(ext: string): string {
  const map: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
    tif: "image/tiff", tiff: "image/tiff", bmp: "image/bmp", svg: "image/svg+xml",
    pdf: "application/pdf", eps: "application/postscript", ai: "application/postscript",
    psd: "image/vnd.adobe.photoshop", zip: "application/zip", txt: "text/plain",
  };
  return map[ext] ?? "application/octet-stream";
}

export function kindForExt(ext: string): string {
  if (IMAGE_EXT.has(ext)) return "image";
  if (["svg", "eps", "ai", "pdf"].includes(ext)) return ext === "pdf" ? "document" : "vector";
  if (["txt", "doc", "docx", "csv"].includes(ext)) return "document";
  return "other";
}

/** Generate a small JPEG thumbnail (base64, no data-URI prefix) from image bytes.
 *  Returns null for non-raster inputs or on failure — callers fall back to a glyph. */
export async function makeThumbnail(buf: Buffer, ext: string): Promise<string | null> {
  if (!IMAGE_EXT.has(ext)) return null;
  try {
    const out = await sharp(buf, { failOn: "none" })
      .rotate()
      .resize(THUMB_MAX, THUMB_MAX, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();
    return out.toString("base64");
  } catch {
    return null;
  }
}
