import { and, asc, desc, eq, gt, sql, count } from "drizzle-orm";
import { db } from "@/db";
import { inventoryItems, quotes, businessPartners } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView } from "@/lib/rbac";

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (headers: string[], rows: unknown[][]) =>
  [headers.join(","), ...rows.map((r) => r.map(cell).join(","))].join("\r\n");

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "reports")) return new Response("Forbidden", { status: 403 });
  const d = new URL(req.url).searchParams.get("d") ?? "inventory";

  let name = "report";
  let headers: string[] = [];
  let rows: unknown[][] = [];

  if (d === "inventory" || d === "low-stock") {
    name = d === "low-stock" ? "low-stock" : "inventory-valuation";
    headers = ["SKU", "Name", "Category", "Unit", "On hand", "Cost", "Value", "Reorder point", "Supplier"];
    const where = d === "low-stock" ? and(gt(inventoryItems.reorderPoint, "0"), sql`${inventoryItems.onHand} <= ${inventoryItems.reorderPoint}`) : undefined;
    const items = await db.select().from(inventoryItems).where(where).orderBy(asc(inventoryItems.name));
    rows = items.map((i) => [i.sku, i.name, i.category ?? "", i.unit, Number(i.onHand), Number(i.cost), (Number(i.cost) * Number(i.onHand)).toFixed(2), Number(i.reorderPoint), i.supplier ?? ""]);
  } else if (d === "top-customers") {
    name = "top-customers";
    headers = ["Customer", "Quotes", "Quoted value"];
    const top = await db
      .select({ company: businessPartners.companyName, n: count(), total: sql<string>`COALESCE(SUM(${quotes.total}),0)` })
      .from(quotes).innerJoin(businessPartners, eq(quotes.bpId, businessPartners.id))
      .groupBy(businessPartners.companyName).orderBy(desc(sql`COALESCE(SUM(${quotes.total}),0)`)).limit(100);
    rows = top.map((r) => [r.company, r.n, Number(r.total).toFixed(2)]);
  } else {
    return new Response("Unknown dataset", { status: 400 });
  }

  return new Response(csv(headers, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="makeready-${name}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
