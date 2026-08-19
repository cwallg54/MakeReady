import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canView } from "@/lib/rbac";
import { listInspections } from "@/lib/quality/data";
import { csvResponse } from "@/lib/csv";
import { fmtDate } from "@/lib/format";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "quality")) return new NextResponse("Forbidden", { status: 403 });
  const rows = await listInspections(2000);
  return csvResponse(
    "quality-inspections.csv",
    ["Inspection #", "Order", "Customer", "Stage", "Result", "Inspected", "Rejected", "Inspector", "Date"],
    rows.map((r) => [r.inspectionNumber, r.orderNumber ?? "", r.customer ?? "", r.stage, r.result, r.qtyInspected, r.qtyRejected, r.inspector ?? "", fmtDate(r.createdAt)]),
  );
}
