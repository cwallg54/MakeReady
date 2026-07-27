import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reportDefinitions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canBuildReports, sourceMeta, type ReportConfig } from "@/lib/reports/sources";
import { runReport, reportToCsv, numericColumns } from "@/lib/reports/run";
import { reportToPdf } from "@/lib/reports/pdf";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canBuildReports(user.roles)) return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  const def = await db.query.reportDefinitions.findFirst({ where: eq(reportDefinitions.id, id) });
  if (!def) return new Response("Not found", { status: 404 });

  const format = new URL(req.url).searchParams.get("format") === "pdf" ? "pdf" : "csv";
  const cfg = def.config as ReportConfig;
  const result = await runReport(def.source, cfg);
  const labels = Object.fromEntries((sourceMeta(def.source)?.fields ?? []).map((f) => [f.key, f.label]));
  const slug = def.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-|-$/g, "") || "report";

  if (format === "pdf") {
    const bytes = await reportToPdf(result, { title: def.name, labels, groupField: cfg.groupField, numericCols: numericColumns(def.source) });
    return new Response(Buffer.from(bytes), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${slug}.pdf"`, "Cache-Control": "no-store" },
    });
  }
  return new Response(reportToCsv(result, labels), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${slug}.csv"`, "Cache-Control": "no-store" },
  });
}
