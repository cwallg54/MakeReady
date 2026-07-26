import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { quoteAttachments } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView } from "@/lib/rbac";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "sales")) return new Response("Forbidden", { status: 403 });
  const { id, attachmentId } = await params;

  const a = await db.query.quoteAttachments.findFirst({
    where: and(eq(quoteAttachments.id, attachmentId), eq(quoteAttachments.quoteId, id)),
  });
  if (!a) return new Response("Not found", { status: 404 });

  const bytes = Buffer.from(a.contentBase64, "base64");
  const inline = a.mimeType.startsWith("image/") || a.mimeType === "application/pdf";
  return new Response(bytes, {
    headers: {
      "Content-Type": a.mimeType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${a.filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
