"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { budgets } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";

async function requireControllingEdit() {
  const user = await getCurrentUser();
  if (!user || !canEdit(user.roles, "controlling")) redirect("/403");
  return user;
}

/** Upsert annual budgets for one or more accounts from the budget form. */
export async function saveBudgetsAction(formData: FormData): Promise<void> {
  const user = await requireControllingEdit();
  const year = Math.round(Number(formData.get("year") ?? 0)) || new Date().getFullYear();
  const accountIds = formData.getAll("accountId").map(String);
  const amounts = formData.getAll("amount").map(String);

  for (let i = 0; i < accountIds.length; i++) {
    const accountId = accountIds[i].trim();
    if (!accountId) continue;
    const amount = Number(String(amounts[i] ?? "").replace(/[$,]/g, "")) || 0;
    await db
      .insert(budgets)
      .values({ accountId, fiscalYear: year, amount: amount.toFixed(2), updatedBy: user.id, updatedAt: new Date() })
      .onConflictDoUpdate({ target: [budgets.accountId, budgets.fiscalYear], set: { amount: amount.toFixed(2), updatedBy: user.id, updatedAt: new Date() } });
  }
  await audit({ userId: user.id, action: "controlling.budget_save", entityType: "budget", entityId: String(year) });
  revalidatePath("/controlling/budget");
  redirect(`/controlling/budget?year=${year}&ok=1`);
}
