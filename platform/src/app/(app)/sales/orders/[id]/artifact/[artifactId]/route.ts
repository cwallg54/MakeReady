import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orderArtifacts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView } from "@/lib/rbac";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; artifactId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "sales")) return new Response("Forbidden", { status: 403 });
  const { id, artifactId } = await params;

  const a = await db.query.orderArtifacts.findFirst({
    where: and(eq(orderArtifacts.id, artifactId), eq(orderArtifacts.orderId, id)),
  });
  if (!a) return new Response("Not found", { status: 404 });

  const bytes = Buffer.from(a.contentBase64, "base64");
  return new Response(bytes, {
    headers: {
      "Content-Type": a.mimeType,
      "Content-Disposition": `inline; filename="${a.filename}"`,
    },
  });
}
