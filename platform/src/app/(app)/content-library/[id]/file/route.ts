import { getCurrentUser } from "@/lib/auth/service";
import { canView } from "@/lib/rbac";
import { assetBytes } from "@/lib/content/data";

// Serves a content-library asset (or its thumbnail with ?thumb=1) to any user
// with Content Library view access.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "content_library")) return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  const thumb = new URL(req.url).searchParams.get("thumb") === "1";

  const data = await assetBytes(id, thumb);
  if (!data) return new Response("Not found", { status: 404 });
  const inline = data.mimeType.startsWith("image/") || data.mimeType === "application/pdf";
  return new Response(data.buf, {
    headers: {
      "Content-Type": data.mimeType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${data.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
