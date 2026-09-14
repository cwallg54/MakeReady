"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/service";
import { canEdit, canView } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { createPayrollRun, postPayrollRun, savePayrollAmounts, voidPayrollRun } from "./payroll";

async function requireAccountingEdit() {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "accounting") || !canEdit(user.roles, "accounting")) redirect("/403");
  return user;
}

const str = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s || null;
};

/** Start a payroll (or accrual) run from the template. */
export async function createPayrollRunAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const templateId = String(formData.get("templateId") ?? "");
  const kind = (String(formData.get("kind") ?? "payroll") === "accrual" ? "accrual" : "payroll") as "payroll" | "accrual";
  const payDate = String(formData.get("payDate") ?? "").trim();
  if (!templateId || !payDate) return;

  const res = await createPayrollRun(
    {
      templateId,
      kind,
      payDate,
      periodStart: str(formData.get("periodStart")),
      periodEnd: str(formData.get("periodEnd")),
      accrualDate: str(formData.get("accrualDate")),
      notes: str(formData.get("notes")),
      copyLast: String(formData.get("copyLast") ?? "") === "1",
    },
    user.id,
  );

  await audit({
    userId: user.id,
    action: "payroll.run_create",
    entityType: "payroll_run",
    entityId: res.ok ? res.id : "—",
    metadata: res.ok ? { runNumber: res.runNumber, kind, payDate } : { error: res.error },
  });
  revalidatePath("/accounting/payroll");
  if (res.ok) redirect(`/accounting/payroll/${res.id}`);
}

/** Save the typed amounts. Fields arrive as `amount[<lineId>]`. */
export async function savePayrollAmountsAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const runId = String(formData.get("runId") ?? "");
  if (!runId) return;

  const amounts: Record<string, number> = {};
  for (const [key, value] of formData.entries()) {
    const m = /^amount\[(.+)\]$/.exec(key);
    if (!m) continue;
    const n = Number(String(value).trim());
    amounts[m[1]] = Number.isFinite(n) ? n : 0;
  }

  const res = await savePayrollAmounts(runId, amounts);
  await audit({ userId: user.id, action: "payroll.run_save", entityType: "payroll_run", entityId: runId, metadata: { lines: Object.keys(amounts).length, ok: res.ok } });
  revalidatePath(`/accounting/payroll/${runId}`);
}

export async function postPayrollRunAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const runId = String(formData.get("runId") ?? "");
  if (!runId) return;
  const res = await postPayrollRun(runId, user.id);
  await audit({
    userId: user.id,
    action: "payroll.run_post",
    entityType: "payroll_run",
    entityId: runId,
    metadata: res.ok ? { entryNumber: res.entryNumber } : { error: res.error },
  });
  revalidatePath(`/accounting/payroll/${runId}`);
  revalidatePath("/accounting/payroll");
  revalidatePath("/accounting/journal");
}

export async function voidPayrollRunAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const runId = String(formData.get("runId") ?? "");
  const reason = str(formData.get("reason")) ?? "Voided";
  if (!runId) return;
  const res = await voidPayrollRun(runId, user.id, reason);
  await audit({ userId: user.id, action: "payroll.run_void", entityType: "payroll_run", entityId: runId, metadata: { reason, ok: res.ok } });
  revalidatePath(`/accounting/payroll/${runId}`);
}
