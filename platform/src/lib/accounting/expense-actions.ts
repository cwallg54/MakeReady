"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { expenseReports } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canEdit, canView } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import {
  addLine,
  cancelReport,
  createReport,
  decideReport,
  removeLine,
  setApprovedAmount,
  settleReport,
  submitReport,
} from "./expenses";

/** Anyone signed in may claim their own expenses. */
async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Approving, settling and claiming on someone else's behalf is a finance job. */
async function requireFinance() {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "accounting") || !canEdit(user.roles, "accounting")) redirect("/403");
  return user;
}

const str = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s || null;
};

/** Only the claimant or finance may open or change a report. */
async function ownReportOrFinance(reportId: string) {
  const user = await requireUser();
  const report = await db.query.expenseReports.findFirst({ where: eq(expenseReports.id, reportId), columns: { employeeId: true } });
  if (!report) redirect("/accounting/expenses");
  const isFinance = canView(user.roles, "accounting") && canEdit(user.roles, "accounting");
  if (report.employeeId !== user.id && !isFinance) redirect("/403");
  return { user, isFinance };
}

export async function createExpenseReportAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  // Claiming for someone else is a finance action; everyone else claims their own.
  const requested = str(formData.get("employeeId"));
  const isFinance = canView(user.roles, "accounting") && canEdit(user.roles, "accounting");
  const employeeId = requested && isFinance ? requested : user.id;

  const res = await createReport(
    {
      employeeId,
      purpose: str(formData.get("purpose")),
      periodFrom: str(formData.get("periodFrom")),
      periodTo: str(formData.get("periodTo")),
    },
    user.id,
  );
  await audit({ userId: user.id, action: "expense.report_create", entityType: "expense_report", entityId: res.id, metadata: { reportNumber: res.reportNumber, employeeId } });
  redirect(`/accounting/expenses/${res.id}`);
}

export async function addExpenseLineAction(formData: FormData): Promise<void> {
  const reportId = String(formData.get("reportId") ?? "");
  if (!reportId) return;
  const { user } = await ownReportOrFinance(reportId);

  const amount = Number(String(formData.get("amount") ?? "0").replace(/[^0-9.-]/g, ""));
  const res = await addLine(reportId, {
    categoryId: str(formData.get("categoryId")),
    spentOn: str(formData.get("spentOn")),
    vendor: str(formData.get("vendor")),
    description: str(formData.get("description")),
    amount: Number.isFinite(amount) ? amount : 0,
    paidBy: (String(formData.get("paidBy") ?? "employee") as "employee" | "company_card" | "corporate_card" | "on_account"),
  });
  await audit({ userId: user.id, action: "expense.line_add", entityType: "expense_report", entityId: reportId, metadata: { amount, ok: res.ok, error: res.error } });
  revalidatePath(`/accounting/expenses/${reportId}`);
}

export async function removeExpenseLineAction(formData: FormData): Promise<void> {
  const reportId = String(formData.get("reportId") ?? "");
  const lineId = String(formData.get("lineId") ?? "");
  if (!reportId || !lineId) return;
  await ownReportOrFinance(reportId);
  await removeLine(reportId, lineId);
  revalidatePath(`/accounting/expenses/${reportId}`);
}

export async function submitExpenseReportAction(formData: FormData): Promise<void> {
  const reportId = String(formData.get("reportId") ?? "");
  if (!reportId) return;
  const { user } = await ownReportOrFinance(reportId);
  const res = await submitReport(reportId, user.id);
  await audit({ userId: user.id, action: "expense.report_submit", entityType: "expense_report", entityId: reportId, metadata: { ok: res.ok, pending: res.pending, error: res.error } });
  revalidatePath(`/accounting/expenses/${reportId}`);
  revalidatePath("/accounting/expenses");
}

export async function decideExpenseReportAction(formData: FormData): Promise<void> {
  const user = await requireFinance();
  const reportId = String(formData.get("reportId") ?? "");
  const approve = String(formData.get("approve") ?? "") === "1";
  if (!reportId) return;
  const res = await decideReport(reportId, approve, str(formData.get("note")) ?? "", user.id);
  await audit({ userId: user.id, action: approve ? "expense.report_approve" : "expense.report_reject", entityType: "expense_report", entityId: reportId, metadata: { ok: res.ok, error: res.error } });
  revalidatePath(`/accounting/expenses/${reportId}`);
  revalidatePath("/accounting/expenses");
}

/** Trim a line to what will actually be allowed. */
export async function setApprovedAmountAction(formData: FormData): Promise<void> {
  const user = await requireFinance();
  const reportId = String(formData.get("reportId") ?? "");
  const lineId = String(formData.get("lineId") ?? "");
  const raw = String(formData.get("approvedAmount") ?? "").trim();
  if (!reportId || !lineId) return;
  const amount = raw === "" ? null : Number(raw.replace(/[^0-9.-]/g, ""));
  await setApprovedAmount(reportId, lineId, amount === null || !Number.isFinite(amount) ? null : amount);
  await audit({ userId: user.id, action: "expense.line_approve_amount", entityType: "expense_report", entityId: reportId, metadata: { lineId, amount } });
  revalidatePath(`/accounting/expenses/${reportId}`);
}

export async function settleExpenseReportAction(formData: FormData): Promise<void> {
  const user = await requireFinance();
  const reportId = String(formData.get("reportId") ?? "");
  if (!reportId) return;
  const res = await settleReport(reportId, user.id);
  await audit({ userId: user.id, action: "expense.report_settle", entityType: "expense_report", entityId: reportId, metadata: { ok: res.ok, billId: res.billId, error: res.error } });
  revalidatePath(`/accounting/expenses/${reportId}`);
  revalidatePath("/accounting/bills");
  revalidatePath("/accounting/payment-runs");
}

export async function cancelExpenseReportAction(formData: FormData): Promise<void> {
  const reportId = String(formData.get("reportId") ?? "");
  if (!reportId) return;
  const { user } = await ownReportOrFinance(reportId);
  const res = await cancelReport(reportId, user.id, str(formData.get("reason")) ?? "Cancelled");
  await audit({ userId: user.id, action: "expense.report_cancel", entityType: "expense_report", entityId: reportId, metadata: { ok: res.ok, error: res.error } });
  revalidatePath(`/accounting/expenses/${reportId}`);
}
