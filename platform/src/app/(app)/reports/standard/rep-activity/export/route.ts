import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canView } from "@/lib/rbac";
import { canBuildReports } from "@/lib/reports/sources";
import { csvCell } from "@/lib/reports/standard";
import { getRepActivity, periodSince, parsePeriod } from "@/lib/reports/analytics-data";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "reports") || !canBuildReports(user.roles)) return new NextResponse("Forbidden", { status: 403 });

  const period = parsePeriod(req.nextUrl.searchParams.get("period") ?? undefined);
  const rows = await getRepActivity(periodSince(period));

  const header = ["Rep", "Calls", "Notes", "Emails", "Visits", "Touches", "Quotes", "Won", "Won $", "Orders", "Order $"];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push([r.name, r.calls, r.notes, r.emails, r.visits, r.touches, r.quotes, r.quotesWon, r.wonValue.toFixed(2), r.orders, r.orderValue.toFixed(2)].map(csvCell).join(","));
  }

  return new NextResponse(lines.join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="rep-activity-${period}.csv"` },
  });
}
