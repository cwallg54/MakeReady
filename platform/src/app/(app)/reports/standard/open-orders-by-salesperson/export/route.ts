import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/service";
import { checkStandardAccess } from "@/lib/reports/access";
import { getOpenOrders } from "@/lib/reports/standard-data";
import { fmtDate } from "@/lib/format";
import { daysUntil, csvCell } from "@/lib/reports/standard";

export async function GET() {
  const user = await getCurrentUser();
  // The CSV has to obey the same per-report access as the page it comes
  // from, or a restricted report leaks straight out through its export link.
  if (!user) return new NextResponse("Forbidden", { status: 403 });
  if (!(await checkStandardAccess(user, "open-orders-by-salesperson"))) {
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
