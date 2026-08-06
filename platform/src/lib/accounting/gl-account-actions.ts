"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { glAccounts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { ACCOUNT_TYPE_MAP, type GlAccountType } from "./gl";

async function requireAccountingEdit() {
  const user = await getCurrentUser();
  if (!user || !canEdit(user.roles, "accounting")) redirect("/403");
  return user;
}

const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();

export async function createGlAccountAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const code = str(formData.get("code"));
  const name = str(formData.get("name"));
  const type = str(formData.get("type")) as GlAccountType;
  if (!code || !name || !ACCOUNT_TYPE_MAP[type]) redirect("/accounting/chart?err=fields");
  const existing = await db.query.glAccounts.findFirst({ where: eq(glAccounts.code, code), columns: { id: true } });
  if (existing) redirect("/accounting/chart?err=dupe");
  await db.insert(glAccounts).values({ code, name, type, subtype: str(formData.get("subtype")) || null, description: str(formData.get("description")) || null });
  await audit({ userId: user.id, action: "gl.account_create", entityType: "gl_account", entityId: code, metadata: { type } });
  revalidatePath("/accounting/chart");
}

export async function updateGlAccountAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const id = str(formData.get("id"));
  if (!id) return;
  const name = str(formData.get("name"));
  const type = str(formData.get("type")) as GlAccountType;
  if (!name || !ACCOUNT_TYPE_MAP[type]) redirect("/accounting/chart?err=fields");
  await db.update(glAccounts).set({ name, type, subtype: str(formData.get("subtype")) || null, description: str(formData.get("description")) || null, updatedAt: new Date() }).where(eq(glAccounts.id, id));
  await audit({ userId: user.id, action: "gl.account_update", entityType: "gl_account", entityId: id });
  revalidatePath("/accounting/chart");
}

export async function toggleGlAccountAction(formData: FormData): Promise<void> {
  await requireAccountingEdit();
  const id = str(formData.get("id"));
  if (!id) return;
  const acct = await db.query.glAccounts.findFirst({ where: eq(glAccounts.id, id), columns: { active: true } });
  if (!acct) return;
  await db.update(glAccounts).set({ active: !acct.active, updatedAt: new Date() }).where(eq(glAccounts.id, id));
  revalidatePath("/accounting/chart");
}
