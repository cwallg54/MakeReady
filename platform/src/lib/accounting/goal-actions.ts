"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { salesReps } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canEdit, canView } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { setGoal } from "./sales-goals";

async function requireGoalEdit() {
  const user = await getCurrentUser();
  // Goals are a finance/management number: whoever can edit accounting or run
  // sales management sets them.
  if (!user || !(canEdit(user.roles, "accounting") || canEdit(user.roles, "sales"))) redirect("/403");
  return user;
}

/** Save a grid of goals. Fields arrive as `goal[<repId>|<year>|<month>]`. */
export async function saveGoalsAction(formData: FormData): Promise<void> {
  const user = await requireGoalEdit();
  let saved = 0;

  for (const [key, value] of formData.entries()) {
    const m = /^goal\[([^|]+)\|(\d{4})\|(\d{1,2})\]$/.exec(key);
    if (!m) continue;
    const raw = String(value).trim();
    const amount = raw === "" ? 0 : Number(raw.replace(/[^0-9.-]/g, ""));
    if (!Number.isFinite(amount)) continue;
    await setGoal(m[1], Number(m[2]), Number(m[3]), amount, user.id);
    saved++;
  }

  await audit({ userId: user.id, action: "sales.goals_save", entityType: "sales_goal", entityId: "grid", metadata: { cells: saved } });
  revalidatePath("/accounting/goals");
}

/** Link a legacy rep to a platform user so new orders credit the same person. */
export async function linkRepUserAction(formData: FormData): Promise<void> {
  const user = await requireGoalEdit();
  const repId = String(formData.get("repId") ?? "");
  const userId = String(formData.get("userId") ?? "").trim() || null;
  if (!repId) return;
  await db.update(salesReps).set({ userId }).where(eq(salesReps.id, repId));
  await audit({ userId: user.id, action: "sales.rep_link_user", entityType: "sales_rep", entityId: repId, metadata: { userId } });
  revalidatePath("/accounting/goals");
}

/** Retire a rep from the goal grid without deleting their history. */
export async function toggleRepActiveAction(formData: FormData): Promise<void> {
  const user = await requireGoalEdit();
  const repId = String(formData.get("repId") ?? "");
  const active = String(formData.get("active") ?? "") === "1";
  if (!repId) return;
  await db.update(salesReps).set({ active }).where(eq(salesReps.id, repId));
  await audit({ userId: user.id, action: "sales.rep_toggle", entityType: "sales_rep", entityId: repId, metadata: { active } });
  revalidatePath("/accounting/goals");
}
