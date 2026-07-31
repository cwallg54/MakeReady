import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canView } from "@/lib/rbac";
import { canBuildReports } from "@/lib/reports/sources";
import { getOpenOrders } from "@/lib/reports/standard-data";
import { fmtDate } from "@/lib/format";
import { daysUntil } from "@/lib/reports/standard";

function csvCell(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "reports") || !canBuildReports(user.roles)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const now = new Date();
  const rows = await getOpenOrders();
  const monthFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", month: "long", year: "numeric" });

  const header = ["Salesperson", "Due Month", "Territory", "Customer Code", "Customer", "SO #", "Type", "PO #", "Entered", "Due", "Days Until Due", "Date Type", "Ship Via", "Amount"];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push([
      r.repName,
      r.dueDate ? monthFmt.format(r.dueDate) : "No due date",
      r.territory ?? "",
      r.code ?? "",
      r.customer,
      r.orderNumber,
      r.orderType ?? "",
      r.poNumber ?? "",
      fmtDate(r.enteredDate),
      r.dueDate ? fmtDate(r.dueDate) : "",
      r.dueDate ? daysUntil(r.dueDate, now) : "",
      r.dateType,
      r.shipVia ?? "",
      r.amount.toFixed(2),
    ].map(csvCell).join(","));
  }

  return new NextResponse(lines.join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="open-orders-by-salesperson.csv"` },
  });
}
