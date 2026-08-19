import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canView } from "@/lib/rbac";
import { jobProfitability } from "@/lib/controlling/costing";
import { csvResponse } from "@/lib/csv";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "controlling")) return new NextResponse("Forbidden", { status: 403 });
  const jobs = await jobProfitability(1000);
  return csvResponse(
    "job-costing.csv",
    ["Order", "Customer", "Status", "Revenue", "Cost", "Margin", "Margin %"],
    jobs.map((j) => [j.orderNumber ?? "", j.customer ?? "", j.status, j.revenue.toFixed(2), j.cost.toFixed(2), j.margin.toFixed(2), (j.marginPct * 100).toFixed(1)]),
  );
}
