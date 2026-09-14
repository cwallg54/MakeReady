import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/service";
import { checkStandardAccess } from "@/lib/reports/access";
import { csvCell } from "@/lib/reports/standard";
import { getLeadSourceRoi } from "@/lib/reports/analytics-data";

export async function GET() {
  const user = await getCurrentUser();
  // The CSV has to obey the same per-report access as the page it comes
  // from, or a restricted report leaks straight out through its export link.
  if (!user) return new NextResponse("Forbidden", { status: 403 });
  if (!(await checkStandardAccess(user, "lead-source-roi"))) return new NextResponse("Forbidden", { status: 403 });

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
