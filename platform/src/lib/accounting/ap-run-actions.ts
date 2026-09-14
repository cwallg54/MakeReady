"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { paymentRunLines, vendorCredits } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canEdit, canView } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import {
  applyVendorCredit,
  approvePaymentRun,
  createPaymentRun,
  nextVendorCreditNumber,
  payPaymentRun,
  voidPaymentRun,
} from "./payment-runs";

async function requireAccountingEdit() {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "accounting") || !canEdit(user.roles, "accounting")) redirect("/403");
  return user;
}

const str = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s || null;
};

// ---------------------------------------------------------------------------
// Payment runs
// ---------------------------------------------------------------------------

export async function createPaymentRunAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const billIds = formData.getAll("billIds").map(String).filter(Boolean);
  const method = String(formData.get("method") ?? "ach") as "check" | "ach" | "card" | "cash" | "credit" | "other";
  const bankAccountId = String(formData.get("bankAccountId") ?? "");
  const runDateStr = String(formData.get("runDate") ?? "").trim();
  const firstCheck = Number(String(formData.get("firstCheckNumber") ?? "").trim());

  const res = await createPaymentRun(
    {
      billIds,
      method,
      bankAccountId,
      runDate: runDateStr ? new Date(`${runDateStr}T12:00:00`) : new Date(),
      dueThrough: str(formData.get("dueThrough")),
      firstCheckNumber: Number.isFinite(firstCheck) && firstCheck > 0 ? firstCheck : null,
      notes: str(formData.get("notes")),
    },
    user.id,
  );

  await audit({
    userId: user.id,
    action: "ap.run_create",
    entityType: "payment_run",
    entityId: res.ok ? res.id : "—",
    metadata: res.ok ? { runNumber: res.runNumber, total: res.total, bills: res.bills } : { error: res.error },
  });
  revalidatePath("/accounting/payment-runs");
  if (res.ok) redirect(`/accounting/payment-runs/${res.id}`);
}

/** Drop a bill out of a draft run (or put it back). */
export async function toggleRunLineAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const lineId = String(formData.get("lineId") ?? "");
  const runId = String(formData.get("runId") ?? "");
  const included = String(formData.get("included") ?? "") === "1";
  if (!lineId || !runId) return;
  await db.update(paymentRunLines).set({ included }).where(eq(paymentRunLines.id, lineId));
  await audit({ userId: user.id, action: "ap.run_line_toggle", entityType: "payment_run", entityId: runId, metadata: { lineId, included } });
  revalidatePath(`/accounting/payment-runs/${runId}`);
}

export async function approvePaymentRunAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const runId = String(formData.get("runId") ?? "");
  if (!runId) return;
  const res = await approvePaymentRun(runId, user.id);
  await audit({ userId: user.id, action: "ap.run_approve", entityType: "payment_run", entityId: runId, metadata: { ok: res.ok, error: res.error } });
  revalidatePath(`/accounting/payment-runs/${runId}`);
}

export async function payPaymentRunAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const runId = String(formData.get("runId") ?? "");
  if (!runId) return;
  const res = await payPaymentRun(runId, user.id);
  await audit({ userId: user.id, action: "ap.run_pay", entityType: "payment_run", entityId: runId, metadata: { ok: res.ok, instruments: res.instruments, error: res.error } });
  revalidatePath(`/accounting/payment-runs/${runId}`);
  revalidatePath("/accounting/bills");
}

export async function voidPaymentRunAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const runId = String(formData.get("runId") ?? "");
  const reason = str(formData.get("reason")) ?? "Voided";
  if (!runId) return;
  const res = await voidPaymentRun(runId, user.id, reason);
  await audit({ userId: user.id, action: "ap.run_void", entityType: "payment_run", entityId: runId, metadata: { reason, ok: res.ok } });
  revalidatePath(`/accounting/payment-runs/${runId}`);
}

// ---------------------------------------------------------------------------
// Vendor credits
// ---------------------------------------------------------------------------

export async function createVendorCreditAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const vendorId = str(formData.get("vendorId"));
  if (!vendorId) return;
  const amount = Number(String(formData.get("total") ?? "0"));
  const creditNumber = await nextVendorCreditNumber();

  const [credit] = await db
    .insert(vendorCredits)
    .values({
      creditNumber,
      vendorId,
      vendorRef: str(formData.get("vendorRef")),
      reason: str(formData.get("reason")),
      total: (Number.isFinite(amount) && amount > 0 ? amount : 0).toFixed(2),
      status: "draft",
      createdBy: user.id,
    })
    .returning({ id: vendorCredits.id });

  await audit({ userId: user.id, action: "ap.vendor_credit_create", entityType: "vendor_credit", entityId: credit.id, metadata: { creditNumber, amount } });
  redirect(`/accounting/vendor-credits/${credit.id}`);
}

export async function issueVendorCreditAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const creditId = String(formData.get("creditId") ?? "");
  if (!creditId) return;
  const credit = await db.query.vendorCredits.findFirst({ where: eq(vendorCredits.id, creditId) });
  if (!credit || credit.status !== "draft" || Number(credit.total) <= 0) return;
  await db
    .update(vendorCredits)
    .set({ status: "open", issueDate: credit.issueDate ?? new Date(), updatedAt: new Date() })
    .where(eq(vendorCredits.id, creditId));
  await audit({ userId: user.id, action: "ap.vendor_credit_issue", entityType: "vendor_credit", entityId: creditId, metadata: { total: credit.total } });
  revalidatePath(`/accounting/vendor-credits/${creditId}`);
}

export async function applyVendorCreditAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const creditId = String(formData.get("creditId") ?? "");
  if (!creditId) return;

  const lines: { billId: string; amount: number }[] = [];
  for (const [key, value] of formData.entries()) {
    const m = /^apply\[(.+)\]$/.exec(key);
    if (!m) continue;
    const amount = Number(String(value).trim());
    if (Number.isFinite(amount) && amount > 0) lines.push({ billId: m[1], amount });
  }

  const res = await applyVendorCredit(creditId, lines, user.id);
  await audit({ userId: user.id, action: "ap.vendor_credit_apply", entityType: "vendor_credit", entityId: creditId, metadata: res.ok ? { applied: res.applied } : { error: res.error } });
  revalidatePath(`/accounting/vendor-credits/${creditId}`);
}
