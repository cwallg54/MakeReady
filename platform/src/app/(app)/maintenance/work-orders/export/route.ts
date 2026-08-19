import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canView } from "@/lib/rbac";
import { listWorkOrders } from "@/lib/maintenance/data";
import { csvResponse } from "@/lib/csv";
import { fmtDate } from "@/lib/format";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "maintenance")) return new NextResponse("Forbidden", { status: 403 });
  const status = req.nextUrl.searchParams.get("status") || undefined;
  const rows = await listWorkOrders(status);
  return csvResponse(
    "maintenance-work-orders.csv",
    ["WO #", "Equipment", "Type", "Priority", "Status", "Assignee", "Scheduled", "Completed", "Downtime (min)", "Cost"],
    rows.map((w) => [w.woNumber, w.equipmentName ?? "", w.type, w.priority, w.status, w.assignee ?? "", w.scheduledDate ? fmtDate(w.scheduledDate) : "", w.completedDate ? fmtDate(w.completedDate) : "", w.downtimeMinutes, Number(w.cost).toFixed(2)]),
  );
}
