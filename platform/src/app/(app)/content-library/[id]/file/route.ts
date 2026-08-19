import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contentAssets } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView } from "@/lib/rbac";
import { fileSasUrl } from "@/lib/content/azure";

// Serves a content-library asset (or its thumbnail with ?thumb=1) to any user
// with Content Library view access. Thumbnails always come from Neon (small,
// generated). Full files: DB-backed assets stream their bytes; Azure-backed
// assets redirect to a short-lived SAS URL so the big file flows straight from
// Azure to the browser — never proxied through the app or stored in Neon.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "content_library")) return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  const thumb = new URL(req.url).searchParams.get("thumb") === "1";

  const a = await db.query.contentAssets.findFirst({ where: eq(contentAssets.id, id) });
  if (!a) return new Response("Not found", { status: 404 });

  if (thumb) {
    if (!a.thumbnailBase64) return new Response("No thumbnail", { status: 404 });
    return new Response(Buffer.from(a.thumbnailBase64, "base64"), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" },
    });
  }

  // Full file.
  if (a.storageProvider === "azure_files" && a.storagePath) {
    const url = fileSasUrl(a.storagePath, 30);
    if (url) return Response.redirect(url, 302);
    return new Response("Storage not configured", { status: 503 });
  }
  if (!a.contentBase64) return new Response("File not available", { status: 404 });
  const inline = a.mimeType.startsWith("image/") || a.mimeType === "application/pdf";
  return new Response(Buffer.from(a.contentBase64, "base64"), {
    headers: {
      "Content-Type": a.mimeType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${a.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
