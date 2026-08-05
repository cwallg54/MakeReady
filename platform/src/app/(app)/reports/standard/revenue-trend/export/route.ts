import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canView } from "@/lib/rbac";
import { canBuildReports } from "@/lib/reports/sources";
import { csvCell } from "@/lib/reports/standard";
import { getRevenueTrend } from "@/lib/reports/analytics-data";

const MONTHS: Record<string, number | null> = { "12": 12, "24": 24, "36": 36, all: null };

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "reports") || !canBuildReports(user.roles)) return new NextResponse("Forbidden", { status: 403 });

  const rangeKey = req.nextUrl.searchParams.get("range") ?? "24";
  const months = rangeKey in MONTHS ? MONTHS[rangeKey] : 24;
  const points = await getRevenueTrend(months);

  const lines = [["Month", "SAP history", "MakeReady", "Total"].map(csvCell).join(",")];
  for (const p of points) lines.push([p.month, p.historical.toFixed(2), p.current.toFixed(2), p.total.toFixed(2)].map(csvCell).join(","));

  return new NextResponse(lines.join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="revenue-trend-${rangeKey}.csv"` },
  });
}
