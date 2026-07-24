import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser, type AuthUser } from "./service";
import { canView, isAdmin, type ModuleKey } from "@/lib/rbac";

/** Require an authenticated user; redirect to login (or forced reset) otherwise. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustResetPassword) redirect("/reset-required");
  return user;
}

/** Require view access to a module; redirect to /403 if not permitted. */
export async function requireModule(module: ModuleKey): Promise<AuthUser> {
  const user = await requireUser();
  if (!canView(user.roles, module)) redirect("/403");
  return user;
}

/** Require the Admin role. */
export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireUser();
  if (!isAdmin(user.roles)) redirect("/403");
  return user;
}
