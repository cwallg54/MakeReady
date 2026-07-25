import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orderAttachments } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView } from "@/lib/rbac";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "sales")) return new Response("Forbidden", { status: 403 });
  const { id, attachmentId } = await params;

  const a = await db.query.orderAttachments.findFirst({
    where: and(eq(orderAttachments.id, attachmentId), eq(orderAttachments.orderId, id)),
  });
  if (!a) return new Response("Not found", { status: 404 });

  const bytes = Buffer.from(a.contentBase64, "base64");
  // Show images/PDFs inline; download everything else.
  const inline = a.mimeType.startsWith("image/") || a.mimeType === "application/pdf";
  return new Response(bytes, {
    headers: {
      "Content-Type": a.mimeType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${a.filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
