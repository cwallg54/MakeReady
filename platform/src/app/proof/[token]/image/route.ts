import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orderProofs, orderAttachments } from "@/db/schema";

// Public: serves the artwork for a proof by its token (no login). Only the
// single attachment tied to this proof is exposed.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const proof = await db.query.orderProofs.findFirst({ where: eq(orderProofs.token, token) });
  if (!proof?.attachmentId) return new Response("Not found", { status: 404 });
  const a = await db.query.orderAttachments.findFirst({ where: eq(orderAttachments.id, proof.attachmentId) });
  if (!a) return new Response("Not found", { status: 404 });

  const bytes = Buffer.from(a.contentBase64, "base64");
  return new Response(bytes, {
    headers: {
      "Content-Type": a.mimeType,
      "Content-Disposition": `inline; filename="${a.filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=600",
    },
  });
}
