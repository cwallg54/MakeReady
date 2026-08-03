import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reportSettings } from "@/db/schema";
import type { ReportSettings } from "./report-config";

/** Load the shared saved overrides for a report (empty object if none). */
export async function getReportSettings(key: string): Promise<ReportSettings> {
  const row = await db.query.reportSettings.findFirst({ where: eq(reportSettings.reportKey, key) });
  return (row?.config as ReportSettings | null) ?? {};
}
