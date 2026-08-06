import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reportDefinitions } from "@/db/schema";
import { runReport, reportToCsv, numericColumns } from "./run";
import { reportToPdf } from "./pdf";
import { sourceMeta, type ReportConfig } from "./sources";
import { sendReportEmail } from "@/lib/email";

const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-|-$/g, "") || "report";

/** Run a saved report, render it (CSV/PDF), and email it to the recipients.
 *  Shared by the daily schedule cron and the on-demand "Send now" action.
 *  Returns true if the email was actually dispatched. */
export async function buildAndEmailReport(reportId: string, format: "csv" | "pdf", recipients: string[]): Promise<boolean> {
  const def = await db.query.reportDefinitions.findFirst({ where: eq(reportDefinitions.id, reportId) });
  if (!def || recipients.length === 0) return false;
  const cfg = def.config as ReportConfig;
  const result = await runReport(def.source, cfg);
  const labels = Object.fromEntries((sourceMeta(def.source)?.fields ?? []).map((f) => [f.key, f.label]));

  let b64: string, ext: string;
  if (format === "pdf") {
    const bytes = await reportToPdf(result, { title: def.name, labels, groupField: cfg.groupField, numericCols: numericColumns(def.source) });
    b64 = Buffer.from(bytes).toString("base64");
    ext = "pdf";
  } else {
    b64 = Buffer.from(reportToCsv(result, labels), "utf8").toString("base64");
    ext = "csv";
  }
  return sendReportEmail(recipients, def.name, b64, `${slug(def.name)}.${ext}`);
}
