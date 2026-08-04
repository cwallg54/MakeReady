import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canView } from "@/lib/rbac";
import { canBuildReports } from "@/lib/reports/sources";
import { csvCell } from "@/lib/reports/standard";
import { getLeadSourceRoi } from "@/lib/reports/analytics-data";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "reports") || !canBuildReports(user.roles)) return new NextResponse("Forbidden", { status: 403 });

  const rows = await getLeadSourceRoi();
  const header = ["Lead source", "Accounts", "Customers", "Conversion %", "Revenue", "Per account"];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push([r.source, r.accounts, r.customers, r.accounts ? Math.round((r.customers / r.accounts) * 100) : 0, r.revenue.toFixed(2), r.perAccount.toFixed(2)].map(csvCell).join(","));
  }

  return new NextResponse(lines.join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="lead-source-roi.csv"` },
  });
}
