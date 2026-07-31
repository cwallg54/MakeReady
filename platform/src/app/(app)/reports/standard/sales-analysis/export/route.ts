import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canView } from "@/lib/rbac";
import { canBuildReports } from "@/lib/reports/sources";
import { getSalesAnalysis } from "@/lib/reports/standard-data";
import { FISCAL_MONTHS } from "@/lib/reports/standard";

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "reports") || !canBuildReports(user.roles)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const now = new Date();
  const currentFy = now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear();
  const fy = Number(req.nextUrl.searchParams.get("fy")) || currentFy;
  const { groups } = await getSalesAnalysis(fy);

  const header = ["Salesperson", "Customer Code", "Customer", "Terms", "Period", ...FISCAL_MONTHS, "3 Mo Total", "Total"];
  const lines = [header.map(csvCell).join(",")];
  for (const g of groups) {
    for (const c of g.customers) {
      const rows: [string, typeof c.current][] = [["Current Yr", c.current], ["Prior Yr", c.prior], ["2 Yrs Ago", c.twoAgo]];
      for (const [label, yr] of rows) {
        lines.push([g.repName, c.code, c.name, c.terms, label, ...yr.months.map((n) => Math.round(n)), Math.round(yr.threeMo), Math.round(yr.total)].map(csvCell).join(","));
      }
    }
  }

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sales-analysis-fy${fy}.csv"`,
    },
  });
}
