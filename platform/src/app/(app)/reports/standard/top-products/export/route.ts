import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/service";
import { checkStandardAccess } from "@/lib/reports/access";
import { csvCell, ORDER_TYPE_LABEL } from "@/lib/reports/standard";
import { getTopProducts, periodSince, parsePeriod } from "@/lib/reports/analytics-data";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  // The CSV has to obey the same per-report access as the page it comes
  // from, or a restricted report leaks straight out through its export link.
  if (!user) return new NextResponse("Forbidden", { status: 403 });
  if (!(await checkStandardAccess(user, "top-products"))) return new NextResponse("Forbidden", { status: 403 });

  const period = parsePeriod(req.nextUrl.searchParams.get("period") ?? undefined);
  const { products, byType } = await getTopProducts(periodSince(period));

  const lines = [["Section", "Name", "Qty", "Quotes/Orders", "Quoted/Amount", "Won"].map(csvCell).join(",")];
  for (const p of products) lines.push(["Line item", p.description, p.qty, p.quotes, p.revenue.toFixed(2), p.wonRevenue.toFixed(2)].map(csvCell).join(","));
  for (const t of byType) lines.push(["Order type", t.orderType ? (ORDER_TYPE_LABEL[t.orderType] ?? t.orderType) : "Unspecified", "", t.orders, t.amount.toFixed(2), ""].map(csvCell).join(","));

  return new NextResponse(lines.join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="top-products-${period}.csv"` },
  });
}
