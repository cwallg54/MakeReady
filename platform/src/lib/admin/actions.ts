"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  users,
  userRoles,
  sessions,
  systemSettings,
  SYSTEM_SETTINGS_ID,
  notifications,
  accountGroups,
  businessPartners,
  roleEnum,
  type Role,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { createPasswordReset } from "@/lib/auth/service";
import { sendPasswordResetEmail, sendWelcomeEmail } from "@/lib/email";
import { audit } from "@/lib/audit";

async function assertAdmin() {
  const user = await getCurrentUser();
  if (!user || !user.roles.includes("admin")) redirect("/403");
  return user;
}

function parseRoles(formData: FormData): Role[] {
  const valid = new Set(roleEnum.enumValues);
  return formData
    .getAll("roles")
    .map(String)
    .filter((r): r is Role => valid.has(r as Role));
}

export interface AdminState {
  error?: string;
  ok?: boolean;
}

const userSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().toLowerCase().email("Valid email required"),
});

export async function createUserAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const admin = await assertAdmin();
  const parsed = userSchema.safeParse({ name: formData.get("name"), email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const roles = parseRoles(formData);
  if (roles.length === 0) return { error: "Assign at least one role." };

  const existing = await db.query.users.findFirst({ where: eq(users.email, parsed.data.email) });
  if (existing) return { error: "A user with that email already exists." };

  const newUserId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({ name: parsed.data.name, email: parsed.data.email, mustResetPassword: true })
      .returning({ id: users.id });
    await tx.insert(userRoles).values(roles.map((role) => ({ userId: created.id, role })));
    await audit(
      {
        userId: admin.id,
        action: "user.create",
        entityType: "user",
        entityId: created.id,
        metadata: { email: parsed.data.email, roles },
      },
      tx,
    );
    return created.id;
  });

  // Send the new user a welcome email with set-password + sign-in instructions.
  const link = await createPasswordReset(parsed.data.email);
  const loginUrl = `${process.env.APP_URL ?? ""}/login`;
  if (link) await sendWelcomeEmail(link.email, parsed.data.name, link.url, loginUrl);

  revalidatePath("/admin/users");
  redirect(`/admin/users?created=${encodeURIComponent(parsed.data.email)}&id=${newUserId}`);
}

export async function updateUserAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const admin = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const parsed = userSchema.safeParse({ name: formData.get("name"), email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const target = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!target) return { error: "User not found." };

  const roles = parseRoles(formData);
  if (roles.length === 0) return { error: "A user must have at least one role." };

  // Guard against removing your own Admin role or the last active Admin.
  if (!roles.includes("admin")) {
    if (id === admin.id) return { error: "You can't remove your own Admin role." };
    const otherActiveAdmins = await db
      .select({ id: users.id })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .where(and(eq(userRoles.role, "admin"), eq(users.status, "active"), ne(users.id, id)));
    if (otherActiveAdmins.length === 0) return { error: "At least one active Admin is required." };
  }

  if (target.email !== parsed.data.email) {
    const dupe = await db.query.users.findFirst({ where: eq(users.email, parsed.data.email) });
    if (dupe) return { error: "Another user already uses that email." };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ name: parsed.data.name, email: parsed.data.email, updatedAt: new Date() })
      .where(eq(users.id, id));
    await tx.delete(userRoles).where(eq(userRoles.userId, id));
    await tx.insert(userRoles).values(roles.map((role) => ({ userId: id, role })));
    await audit(
      { userId: admin.id, action: "user.update", entityType: "user", entityId: id, metadata: { roles } },
      tx,
    );
  });

  revalidatePath("/admin/users");
  redirect("/admin/users");
}

export async function setUserStatusAction(formData: FormData): Promise<void> {
  const admin = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (status !== "active" && status !== "inactive") return;

  // An admin can never deactivate their own account (self-lockout guard).
  if (status === "inactive" && id === admin.id) return;

  // Don't allow deactivating the last active admin.
  if (status === "inactive") {
    const activeAdmins = await db
      .select({ id: users.id })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .where(and(eq(userRoles.role, "admin"), eq(users.status, "active")));
    if (activeAdmins.length <= 1 && activeAdmins.some((a) => a.id === id)) return;
  }

  await db.transaction(async (tx) => {
    await tx.update(users).set({ status, updatedAt: new Date() }).where(eq(users.id, id));
    if (status === "inactive") {
      await tx.delete(sessions).where(eq(sessions.userId, id)); // immediate session invalidation
    }
    await audit(
      { userId: admin.id, action: `user.${status === "active" ? "activate" : "deactivate"}`, entityType: "user", entityId: id },
      tx,
    );
  });

  revalidatePath("/admin/users");
}

export async function deleteUserAction(formData: FormData): Promise<void> {
  const admin = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id || id === admin.id) return; // never delete yourself

  const target = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!target) return;
  // Safety: only inactive accounts can be hard-deleted.
  if (target.status !== "inactive") return;

  await db.transaction(async (tx) => {
    // Null out no-cascade references so the delete doesn't violate FKs.
    await tx.update(businessPartners).set({ createdBy: null }).where(eq(businessPartners.createdBy, id));
    await tx.update(systemSettings).set({ updatedBy: null }).where(eq(systemSettings.updatedBy, id));
    // Remaining refs cascade (roles, sessions, tokens, notifications) or set null (owner, activities, tasks, audit).
    await tx.delete(users).where(eq(users.id, id));
    await audit(
      { userId: admin.id, action: "user.delete", entityType: "user", entityId: id, metadata: { email: target.email } },
      tx,
    );
  });

  revalidatePath("/admin/users");
}

export async function forceResetAction(formData: FormData): Promise<void> {
  const admin = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const target = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!target) return;

  await db.transaction(async (tx) => {
    await tx.update(users).set({ mustResetPassword: true, updatedAt: new Date() }).where(eq(users.id, id));
    await tx.delete(sessions).where(eq(sessions.userId, id));
    await audit({ userId: admin.id, action: "user.force_reset", entityType: "user", entityId: id }, tx);
  });

  const link = await createPasswordReset(target.email);
  if (link) await sendPasswordResetEmail(link.email, link.url);

  revalidatePath("/admin/users");
}

const settingsSchema = z.object({
  companyName: z.string().trim().min(1),
  legalName: z.string().trim().optional(),
  timezone: z.string().trim().min(1),
  fiscalYearStartMonth: z.coerce.number().int().min(1).max(12),
  sessionTimeoutMinutes: z.coerce.number().int().min(5).max(1440),
  creditApprovalThreshold: z.coerce.number().min(0).max(10_000_000),
});

export async function updateSettingsAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const admin = await assertAdmin();
  const parsed = settingsSchema.safeParse({
    companyName: formData.get("companyName"),
    legalName: formData.get("legalName"),
    timezone: formData.get("timezone"),
    fiscalYearStartMonth: formData.get("fiscalYearStartMonth"),
    sessionTimeoutMinutes: formData.get("sessionTimeoutMinutes"),
    creditApprovalThreshold: formData.get("creditApprovalThreshold") ?? 5000,
  });
  if (!parsed.success) return { error: "Please check the configuration values." };

  const requireMfa = formData.get("requireMfa") === "on";
  const { creditApprovalThreshold, ...rest } = parsed.data;
  const data = { ...rest, creditApprovalThreshold: String(creditApprovalThreshold) };

  await db
    .insert(systemSettings)
    .values({ id: SYSTEM_SETTINGS_ID, ...data, requireMfa, updatedBy: admin.id, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: systemSettings.id,
      set: { ...data, requireMfa, updatedBy: admin.id, updatedAt: new Date() },
    });

  await audit({ userId: admin.id, action: "config.update", entityType: "system_settings", entityId: SYSTEM_SETTINGS_ID });
  revalidatePath("/admin/config");
  return { ok: true };
}

// ---- Account Groups -------------------------------------------------------

export async function createAccountGroupAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const admin = await assertAdmin();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  if (!code || !name) return { error: "Code and name are required." };

  const existing = await db.query.accountGroups.findFirst({ where: eq(accountGroups.code, code) });
  if (existing) return { error: "An account group with that code already exists." };

  await db.insert(accountGroups).values({ code, name });
  await audit({ userId: admin.id, action: "account_group.create", entityType: "account_group", metadata: { code, name } });
  revalidatePath("/admin/account-groups");
  return { ok: true };
}

// ---- Notifications --------------------------------------------------------

export async function markAllReadAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, user.id)));
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
}

export async function markReadAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const ids = formData.getAll("id").map(String);
  if (ids.length === 0) return;
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, user.id), inArray(notifications.id, ids)));
  revalidatePath("/notifications");
}
