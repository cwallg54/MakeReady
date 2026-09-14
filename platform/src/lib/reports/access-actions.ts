"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reportDefinitions, reportSettings } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { isAdmin, ROLES } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { accessForCustom, canManageSharing, removeGrant, upsertGrant } from "./access";

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

const bool = (v: FormDataEntryValue | null) => String(v ?? "") === "1" || String(v ?? "") === "on";

/** Only an owner or an administrator changes who can see a saved report. */
async function requireSharingRights(reportId: string) {
  const user = await requireUser();
  const def = await db.query.reportDefinitions.findFirst({ where: eq(reportDefinitions.id, reportId) });
  if (!def) redirect("/reports");
  if (!(await canManageSharing(user, def))) redirect("/403");
  return { user, def };
}

/** Change a saved report's default visibility. */
export async function setReportVisibilityAction(formData: FormData): Promise<void> {
  const reportId = String(formData.get("reportId") ?? "");
  if (!reportId) return;
  const { user, def } = await requireSharingRights(reportId);
  const visibility = String(formData.get("visibility") ?? "everyone") as "private" | "shared" | "everyone";
  if (!["private", "shared", "everyone"].includes(visibility)) return;

  await db.update(reportDefinitions).set({ visibility, updatedBy: user.id, updatedAt: new Date() }).where(eq(reportDefinitions.id, reportId));
  await audit({
    userId: user.id,
    action: "report.visibility_set",
    entityType: "report",
    entityId: reportId,
    metadata: { name: def.name, from: def.visibility, to: visibility },
  });
  revalidatePath(`/reports/${reportId}/share`);
  revalidatePath("/reports");
}

/** Grant (or update) read / write / delete for one role or one person. */
export async function grantReportAccessAction(formData: FormData): Promise<void> {
  const reportId = String(formData.get("reportId") ?? "").trim();
  const reportKey = String(formData.get("reportKey") ?? "").trim();

  // Saved reports are shared by their owner; built-ins are an admin matter.
  let userId: string;
  if (reportId) {
    const { user } = await requireSharingRights(reportId);
    userId = user.id;
  } else {
    const user = await requireUser();
    if (!isAdmin(user.roles)) redirect("/403");
    userId = user.id;
  }

  const granteeType = String(formData.get("granteeType") ?? "role");
  const role = granteeType === "role" ? String(formData.get("role") ?? "").trim() || null : null;
  const granteeUserId = granteeType === "user" ? String(formData.get("granteeUserId") ?? "").trim() || null : null;
  if (role && !ROLES.includes(role as (typeof ROLES)[number])) return;

  const res = await upsertGrant(
    { reportId: reportId || undefined, reportKey: reportKey || undefined },
    { role, userId: granteeUserId },
    { view: bool(formData.get("canView")), edit: bool(formData.get("canEdit")), delete: bool(formData.get("canDelete")) },
    userId,
  );

  await audit({
    userId,
    action: "report.grant",
    entityType: "report",
    entityId: reportId || reportKey,
    metadata: { role, granteeUserId, ok: res.ok, error: res.error },
  });
  if (reportId) revalidatePath(`/reports/${reportId}/share`);
  revalidatePath("/reports/access");
  revalidatePath("/reports");
}

export async function revokeReportAccessAction(formData: FormData): Promise<void> {
  const grantId = String(formData.get("grantId") ?? "");
  const reportId = String(formData.get("reportId") ?? "").trim();
  if (!grantId) return;

  let userId: string;
  if (reportId) {
    const { user } = await requireSharingRights(reportId);
    userId = user.id;
  } else {
    const user = await requireUser();
    if (!isAdmin(user.roles)) redirect("/403");
    userId = user.id;
  }

  await removeGrant(grantId);
  await audit({ userId, action: "report.revoke", entityType: "report", entityId: reportId || "builtin", metadata: { grantId } });
  if (reportId) revalidatePath(`/reports/${reportId}/share`);
  revalidatePath("/reports/access");
}

/** Lock a built-in report down to explicit grants, or open it back up. */
export async function setReportRestrictedAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!isAdmin(user.roles)) redirect("/403");
  const reportKey = String(formData.get("reportKey") ?? "").trim();
  if (!reportKey) return;
  const restricted = bool(formData.get("restricted"));

  await db
    .insert(reportSettings)
    .values({ reportKey, restricted, updatedBy: user.id, updatedAt: new Date() })
    .onConflictDoUpdate({ target: reportSettings.reportKey, set: { restricted, updatedBy: user.id, updatedAt: new Date() } });

  await audit({ userId: user.id, action: restricted ? "report.restrict" : "report.unrestrict", entityType: "report", entityId: reportKey, metadata: { restricted } });
  revalidatePath("/reports/access");
  revalidatePath("/reports");
}
