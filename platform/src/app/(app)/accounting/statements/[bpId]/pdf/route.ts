import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canView } from "@/lib/rbac";
import { generateStatementPdf } from "@/lib/accounting/statement-pdf";

export async function GET(_req: Request, { params }: { params: Promise<{ bpId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "accounting")) return new NextResponse("Forbidden", { status: 403 });
  const { bpId } = await params;
  const pdf = await generateStatementPdf(bpId, new Date());
  if (!pdf) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(Buffer.from(pdf.bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${pdf.filename}"` },
  });
}
