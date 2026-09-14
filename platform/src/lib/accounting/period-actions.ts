"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/service";
import { canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { fiscalPeriods, fiscalYears } from "@/db/schema";
import { ensureFiscalYear, setPeriodStatus, setYearStatus, type FiscalStatus } from "./fiscal-service";

async function requireAccountingEdit() {
  const user = await getCurrentUser();
  if (!user || !canEdit(user.roles, "accounting")) redirect("/403");
  return user;
}

const VALID: FiscalStatus[] = ["open", "closing", "locked"];

/** Move one period between open / closing / locked. */
export async function setPeriodStatusAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const periodId = String(formData.get("periodId") ?? "");
  const status = String(formData.get("status") ?? "") as FiscalStatus;
  if (!periodId || !VALID.includes(status)) return;

  const period = await db.query.fiscalPeriods.findFirst({ where: eq(fiscalPeriods.id, periodId) });
  if (!period) return;

  await setPeriodStatus(periodId, status, user.id);
  await audit({
    userId: user.id,
    action: status === "locked" ? "gl.period_lock" : status === "closing" ? "gl.period_closing" : "gl.period_reopen",
    entityType: "fiscal_period",
    entityId: periodId,
    metadata: { code: period.code, name: period.name, from: period.status, to: status },
  });
  revalidatePath("/accounting/periods");
  revalidatePath("/accounting/close");
}

/** Lock or reopen an entire fiscal year in one move (year-end). */
export async function setYearStatusAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const yearId = String(formData.get("yearId") ?? "");
  const status = String(formData.get("status") ?? "") as FiscalStatus;
  if (!yearId || !VALID.includes(status)) return;

  const year = await db.query.fiscalYears.findFirst({ where: eq(fiscalYears.id, yearId) });
  if (!year) return;

  await setYearStatus(yearId, status, user.id);
  await audit({
    userId: user.id,
    action: status === "locked" ? "gl.year_lock" : "gl.year_reopen",
    entityType: "fiscal_year",
    entityId: yearId,
    metadata: { year: year.year, from: year.status, to: status },
  });
  revalidatePath("/accounting/periods");
}

/** Create the next fiscal year and its periods so posting can continue. */
export async function createFiscalYearAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const year = Number(formData.get("year"));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return;
  await ensureFiscalYear(year);
  await audit({ userId: user.id, action: "gl.year_create", entityType: "fiscal_year", entityId: String(year), metadata: { year } });
  revalidatePath("/accounting/periods");
}
