import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canView } from "@/lib/rbac";
import { canBuildReports } from "@/lib/reports/sources";
import { getOpenOrders } from "@/lib/reports/standard-data";
import { fmtDate } from "@/lib/format";
import { daysUntil, ORDER_TYPE_LABEL, csvCell } from "@/lib/reports/standard";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "reports") || !canBuildReports(user.roles)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const now = new Date();
  const type = req.nextUrl.searchParams.get("type");
  const filter = type && ORDER_TYPE_LABEL[type] ? type : null;

  let rows = await getOpenOrders();
  if (filter) rows = rows.filter((r) => r.orderType === filter);
  rows.sort((a, b) => (a.orderType ?? "zzz").localeCompare(b.orderType ?? "zzz") || (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity));

  const header = ["Type", "SO #", "Customer Code", "Customer", "Salesperson", "Date Type", "Entered", "Days Open", "Due", "Days Until Due", "Amount"];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push([
      r.orderType ?? "Unspecified",
      r.orderNumber,
      r.code ?? "",
      r.customer,
      r.repName,
      r.dateType,
      fmtDate(r.enteredDate),
      daysUntil(now, r.enteredDate),
      r.dueDate ? fmtDate(r.dueDate) : "",
      r.dueDate ? daysUntil(r.dueDate, now) : "",
      r.amount.toFixed(2),
    ].map(csvCell).join(","));
  }

  return new NextResponse(lines.join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="open-orders-by-type${filter ? `-${filter}` : ""}.csv"` },
  });
}
