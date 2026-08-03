"use server";

import { redirect } from "next/navigation";
import { db } from "@/db";
import { reportSettings } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { audit } from "@/lib/audit";
import { canBuildReports } from "./sources";
import { reportConfig, type ReportSettings } from "./report-config";

/**
 * Save an admin/manager's overrides for a built-in report. Shared for everyone.
 * Column/section checkboxes mean "show"; anything unchecked is hidden.
 */
export async function saveReportSettingsAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !canBuildReports(user.roles)) redirect("/403");
  const key = String(formData.get("key") ?? "");
  const def = reportConfig(key);
  if (!def) return;

  const cfg: ReportSettings = {};
  const title = String(formData.get("title") ?? "").trim();
  if (title && title !== def.name) cfg.title = title;

  const hiddenColumns = (def.columns ?? []).filter((c) => formData.get(`col:${c.key}`) !== "on").map((c) => c.key);
  if (hiddenColumns.length) cfg.hiddenColumns = hiddenColumns;

  const hiddenSections = (def.sections ?? []).filter((s) => formData.get(`sec:${s.key}`) !== "on").map((s) => s.key);
  if (hiddenSections.length) cfg.hiddenSections = hiddenSections;

  const filters: Record<string, string> = {};
  for (const f of def.filters ?? []) {
    const v = String(formData.get(`filter:${f.key}`) ?? "").trim();
    if (v) filters[f.key] = v;
  }
  if (Object.keys(filters).length) cfg.filters = filters;

  if (def.sortable?.length) {
    const sortKey = String(formData.get("sortKey") ?? "").trim();
    if (sortKey && def.sortable.some((s) => s.key === sortKey)) {
      cfg.sortKey = sortKey;
      cfg.sortDir = formData.get("sortDir") === "asc" ? "asc" : "desc";
    }
  }

  await db
    .insert(reportSettings)
    .values({ reportKey: key, config: cfg, updatedBy: user.id, updatedAt: new Date() })
    .onConflictDoUpdate({ target: reportSettings.reportKey, set: { config: cfg, updatedBy: user.id, updatedAt: new Date() } });
  await audit({ userId: user.id, action: "report.configure", entityType: "report", entityId: key });
  redirect(def.href);
}
