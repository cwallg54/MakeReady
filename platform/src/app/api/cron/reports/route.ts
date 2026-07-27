import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reportSchedules, reportDefinitions } from "@/db/schema";
import { runReport, reportToCsv, numericColumns } from "@/lib/reports/run";
import { reportToPdf } from "@/lib/reports/pdf";
import { sourceMeta, type ReportConfig } from "@/lib/reports/sources";
import { sendReportEmail } from "@/lib/email";

const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-|-$/g, "") || "report";

// Daily Vercel Cron — emails any scheduled reports that are due today.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });

  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setUTCHours(0, 0, 0, 0);
  const dow = now.getUTCDay();
  const dom = now.getUTCDate();

  const schedules = await db.select().from(reportSchedules).where(eq(reportSchedules.active, true));
  let sent = 0;
  for (const s of schedules) {
    if (s.lastRunAt && s.lastRunAt >= startOfDay) continue; // already sent today
    const due =
      s.frequency === "daily" ||
      (s.frequency === "weekly" && (s.dayOfWeek ?? 1) === dow) ||
      (s.frequency === "monthly" && (s.dayOfMonth ?? 1) === dom);
    if (!due) continue;

    const def = await db.query.reportDefinitions.findFirst({ where: eq(reportDefinitions.id, s.reportId) });
    if (!def) continue;
    try {
      const cfg = def.config as ReportConfig;
      const result = await runReport(def.source, cfg);
      const labels = Object.fromEntries((sourceMeta(def.source)?.fields ?? []).map((f) => [f.key, f.label]));
      let b64: string, ext: string;
      if (s.format === "pdf") {
        const bytes = await reportToPdf(result, { title: def.name, labels, groupField: cfg.groupField, numericCols: numericColumns(def.source) });
        b64 = Buffer.from(bytes).toString("base64"); ext = "pdf";
      } else {
        b64 = Buffer.from(reportToCsv(result, labels), "utf8").toString("base64"); ext = "csv";
      }
      await sendReportEmail(s.recipients, def.name, b64, `${slug(def.name)}.${ext}`);
      await db.update(reportSchedules).set({ lastRunAt: now }).where(eq(reportSchedules.id, s.id));
      sent++;
    } catch (e) {
      console.error("[cron:reports] schedule failed", s.id, e);
    }
  }
  return Response.json({ ok: true, sent, at: now.toISOString() });
}
