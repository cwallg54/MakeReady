import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/service";
import { canView } from "@/lib/rbac";
import { db } from "@/db";
import { customerAttachments } from "@/db/schema";

// Finance/Admin only — the vault holds sensitive customer documents.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; attId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "accounting")) return new NextResponse("Forbidden", { status: 403 });
  const { id, attId } = await params;
  const doc = await db.query.customerAttachments.findFirst({ where: and(eq(customerAttachments.id, attId), eq(customerAttachments.bpId, id)) });
  if (!doc) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(Buffer.from(doc.contentBase64, "base64"), {
    headers: { "Content-Type": doc.mimeType, "Content-Disposition": `inline; filename="${doc.filename}"` },
  });
}
