"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { systemSettings, SYSTEM_SETTINGS_ID } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { runDueReversals } from "./journal";

async function requireAccountingEdit() {
  const user = await getCurrentUser();
  if (!user || !canEdit(user.roles, "accounting")) redirect("/403");
  return user;
}

/** Set (or clear) the GL period-close date. Entries dated on/before it are
 *  locked from posting/voiding. Clearing it reopens all periods. */
export async function setGlClosingDateAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const dateStr = String(formData.get("closingDate") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;
  const closing = dateStr ? new Date(`${dateStr}T23:59:59`) : null;
  await db
    .insert(systemSettings)
    .values({ id: SYSTEM_SETTINGS_ID, glClosingDate: closing, glClosingNote: note, updatedBy: user.id, updatedAt: new Date() })
    .onConflictDoUpdate({ target: systemSettings.id, set: { glClosingDate: closing, glClosingNote: note, updatedBy: user.id, updatedAt: new Date() } });
  await audit({ userId: user.id, action: closing ? "gl.period_close" : "gl.period_reopen", entityType: "system_settings", entityId: SYSTEM_SETTINGS_ID, metadata: { closing: dateStr, note } });
  revalidatePath("/accounting/close");
  revalidatePath("/accounting/journal");
}

/** Post the accrual reversals that have come due — the first thing the close
 *  checklist asks for. Idempotent: an accrual that already has a live reversal
 *  is skipped. */
export async function runDueReversalsAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const asOfStr = String(formData.get("asOf") ?? "").trim();
  const asOf = asOfStr ? new Date(`${asOfStr}T23:59:59`) : new Date();
  const { reversed } = await runDueReversals(asOf, user.id);
  await audit({ userId: user.id, action: "gl.reversals_run", entityType: "journal_entry", entityId: "batch", metadata: { asOf: asOfStr, reversed } });
  revalidatePath("/accounting/close");
  revalidatePath("/accounting/journal");
}
