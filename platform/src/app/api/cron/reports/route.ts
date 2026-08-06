import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reportSchedules } from "@/db/schema";
import { buildAndEmailReport } from "@/lib/reports/deliver";

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

    try {
      await buildAndEmailReport(s.reportId, s.format === "pdf" ? "pdf" : "csv", s.recipients);
      await db.update(reportSchedules).set({ lastRunAt: now }).where(eq(reportSchedules.id, s.id));
      sent++;
    } catch (e) {
      console.error("[cron:reports] schedule failed", s.id, e);
    }
  }
  return Response.json({ ok: true, sent, at: now.toISOString() });
}
