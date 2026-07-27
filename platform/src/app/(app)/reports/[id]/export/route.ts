import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reportDefinitions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canBuildReports, sourceMeta, type ReportConfig } from "@/lib/reports/sources";
import { runReport, reportToCsv } from "@/lib/reports/run";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canBuildReports(user.roles)) return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  const def = await db.query.reportDefinitions.findFirst({ where: eq(reportDefinitions.id, id) });
  if (!def) return new Response("Not found", { status: 404 });

  const result = await runReport(def.source, def.config as ReportConfig);
  const labels = Object.fromEntries((sourceMeta(def.source)?.fields ?? []).map((f) => [f.key, f.label]));
  const csv = reportToCsv(result, labels);
  const slug = def.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-|-$/g, "") || "report";
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
