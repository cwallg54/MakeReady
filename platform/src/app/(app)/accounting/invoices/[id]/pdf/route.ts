import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canView } from "@/lib/rbac";
import { generateInvoicePdf } from "@/lib/accounting/invoice-pdf";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "accounting")) return new NextResponse("Forbidden", { status: 403 });
  const { id } = await params;
  const pdf = await generateInvoicePdf(id);
  if (!pdf) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(Buffer.from(pdf.bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${pdf.filename}"` },
  });
}
