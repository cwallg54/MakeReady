import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canView } from "@/lib/rbac";
import { listAssets } from "@/lib/assets/data";
import { csvResponse } from "@/lib/csv";
import { fmtDate } from "@/lib/format";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "accounting")) return new NextResponse("Forbidden", { status: 403 });
  const assets = await listAssets();
  return csvResponse(
    "fixed-assets.csv",
    ["Asset #", "Name", "Category", "Acquired", "Cost", "Salvage", "Life (mo)", "Accumulated", "Net book value", "Status"],
    assets.map((a) => [a.assetNumber, a.name, a.category, a.acquisitionDate ? fmtDate(a.acquisitionDate) : "", Number(a.cost).toFixed(2), Number(a.salvageValue).toFixed(2), a.usefulLifeMonths, a.calc.accumulated.toFixed(2), a.calc.netBookValue.toFixed(2), a.status]),
  );
}
