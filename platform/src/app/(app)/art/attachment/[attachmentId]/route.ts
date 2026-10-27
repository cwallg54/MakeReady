import { eq } from "drizzle-orm";
import { db } from "@/db";
import { serveArtFile, sizeParam } from "@/lib/art/files";
import { orderAttachments } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canDoArt } from "@/lib/art/access";

// Serves an order attachment to the art team (who don't have Sales access) so
// they can open/download the customer's original file to edit, and view proofs.
export async function GET(req: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canDoArt(user.roles)) return new Response("Forbidden", { status: 403 });
  const { attachmentId } = await params;

  const a = await db.query.orderAttachments.findFirst({ where: eq(orderAttachments.id, attachmentId) });
  if (!a) return new Response("Not found", { status: 404 });

  return serveArtFile(a, sizeParam(req));
}
