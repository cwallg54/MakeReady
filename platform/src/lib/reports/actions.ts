"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { reportDefinitions, reportSchedules } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { audit } from "@/lib/audit";
import { canBuildReports, type ReportConfig } from "./sources";
import { runReport, type ReportResult } from "./run";
import { buildAndEmailReport } from "./deliver";

async function requireBuild() {
  const user = await getCurrentUser();
  if (!user || !canBuildReports(user.roles)) redirect("/403");
  return user;
}

export interface ReportInput { id?: string; name: string; description?: string; source: string; config: ReportConfig }

export async function saveReport(input: ReportInput): Promise<{ id: string }> {
  const user = await requireBuild();
  const name = (input.name || "").trim() || "Untitled report";
  const config = {
    columns: input.config.columns ?? [],
    filters: input.config.filters ?? [],
    sortField: input.config.sortField,
    sortDir: input.config.sortDir,
    rowLimit: input.config.rowLimit,
  };
  if (input.id) {
    await db.update(reportDefinitions).set({ name, description: input.description ?? null, source: input.source, config, updatedAt: new Date() }).where(eq(reportDefinitions.id, input.id));
    await audit({ userId: user.id, action: "report.update", entityType: "report", entityId: input.id });
    revalidatePath(`/reports/${input.id}`);
    return { id: input.id };
  }
  const [row] = await db.insert(reportDefinitions).values({ name, description: input.description ?? null, source: input.source, config, createdBy: user.id }).returning({ id: reportDefinitions.id });
  await audit({ userId: user.id, action: "report.create", entityType: "report", entityId: row.id, metadata: { name } });
  revalidatePath("/reports");
  return { id: row.id };
}

export async function previewReport(source: string, config: ReportConfig): Promise<ReportResult> {
  await requireBuild();
  return runReport(source, config, 50);
}

export async function deleteReport(formData: FormData): Promise<void> {
  const user = await requireBuild();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.delete(reportDefinitions).where(eq(reportDefinitions.id, id)); // schedules cascade
  await audit({ userId: user.id, action: "report.delete", entityType: "report", entityId: id });
  revalidatePath("/reports");
  redirect("/reports");
}

export async function saveSchedule(formData: FormData): Promise<void> {
  const user = await requireBuild();
  const reportId = String(formData.get("reportId") ?? "");
  if (!reportId) return;
  const frequency = String(formData.get("frequency") ?? "weekly");
  const format = String(formData.get("format") ?? "csv") === "pdf" ? "pdf" : "csv";
  const recipients = String(formData.get("recipients") ?? "").split(/[,\n]/).map((s) => s.trim()).filter((s) => /.+@.+\..+/.test(s));
  if (!recipients.length) redirect(`/reports/${reportId}?err=recipients`);
  const dayOfWeek = frequency === "weekly" ? Number(formData.get("dayOfWeek") ?? 1) : null;
  const dayOfMonth = frequency === "monthly" ? Math.min(28, Math.max(1, Number(formData.get("dayOfMonth") ?? 1))) : null;

  const existing = await db.query.reportSchedules.findFirst({ where: eq(reportSchedules.reportId, reportId) });
  if (existing) {
    await db.update(reportSchedules).set({ frequency, format, dayOfWeek, dayOfMonth, recipients, active: formData.get("active") === "on" }).where(eq(reportSchedules.id, existing.id));
  } else {
    await db.insert(reportSchedules).values({ reportId, frequency, format, dayOfWeek, dayOfMonth, recipients, active: true, createdBy: user.id });
  }
  await audit({ userId: user.id, action: "report.schedule", entityType: "report", entityId: reportId, metadata: { frequency } });
  revalidatePath(`/reports/${reportId}`);
}

/** Send this report to its schedule's recipients right now (a test / on-demand
 *  send), without waiting for the daily cron. */
export async function sendReportNowAction(formData: FormData): Promise<void> {
  const user = await requireBuild();
  const reportId = String(formData.get("reportId") ?? "");
  if (!reportId) return;
  const sched = await db.query.reportSchedules.findFirst({ where: eq(reportSchedules.reportId, reportId) });
  if (!sched || sched.recipients.length === 0) redirect(`/reports/${reportId}?err=recipients`);
  const ok = await buildAndEmailReport(reportId, sched.format === "pdf" ? "pdf" : "csv", sched.recipients);
  await db.update(reportSchedules).set({ lastRunAt: new Date() }).where(eq(reportSchedules.id, sched.id));
  await audit({ userId: user.id, action: "report.send_now", entityType: "report", entityId: reportId, metadata: { ok } });
  redirect(`/reports/${reportId}?sent=${ok ? "1" : "queued"}`);
}

export async function deleteSchedule(formData: FormData): Promise<void> {
  const user = await requireBuild();
  const id = String(formData.get("id") ?? "");
  const reportId = String(formData.get("reportId") ?? "");
  if (!id) return;
  await db.delete(reportSchedules).where(and(eq(reportSchedules.id, id)));
  await audit({ userId: user.id, action: "report.schedule_delete", entityType: "report", entityId: reportId });
  revalidatePath(`/reports/${reportId}`);
}
