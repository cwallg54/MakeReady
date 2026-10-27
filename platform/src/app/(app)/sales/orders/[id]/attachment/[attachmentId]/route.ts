import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { serveArtFile, sizeParam } from "@/lib/art/files";
import { orderAttachments } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView } from "@/lib/rbac";

export async function GET(req: Request, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "sales")) return new Response("Forbidden", { status: 403 });
  const { id, attachmentId } = await params;

  const a = await db.query.orderAttachments.findFirst({
    where: and(eq(orderAttachments.id, attachmentId), eq(orderAttachments.orderId, id)),
  });
  if (!a) return new Response("Not found", { status: 404 });

  return serveArtFile(a, sizeParam(req));
}
