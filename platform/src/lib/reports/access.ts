import "server-only";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { reportDefinitions, reportGrants, reportSettings, users } from "@/db/schema";
import type { Role } from "@/db/schema";
import { canEdit, canView, isAdmin } from "@/lib/rbac";
import { STANDARD_REPORTS } from "./standard";
import { canBuildReports } from "./sources";

export interface ReportAccess {
  view: boolean;
  edit: boolean;
  delete: boolean;
  /** Plain-English explanation, shown on the sharing screen. */
  reason: string;
}

const NONE: ReportAccess = { view: false, edit: false, delete: false, reason: "No access" };
const FULL = (reason: string): ReportAccess => ({ view: true, edit: true, delete: true, reason });

export interface AccessUser {
  id: string;
  roles: readonly Role[];
}

/** The rbac helpers take a mutable array; callers hold a readonly one. */
const roles = (u: AccessUser): Role[] => [...u.roles];

/** Every grant that could apply to this person for a given report. */
async function grantsFor(user: AccessUser, opts: { reportId?: string; reportKey?: string }) {
  const target = opts.reportId
    ? eq(reportGrants.reportId, opts.reportId)
    : eq(reportGrants.reportKey, opts.reportKey ?? "");
  const grantee = or(
    eq(reportGrants.userId, user.id),
    user.roles.length ? inArray(reportGrants.role, user.roles as string[]) : sql`false`,
  );
  return db.select().from(reportGrants).where(and(target, grantee));
}

/** Union of what a set of grants allows — the most permissive one wins. */
function fold(rows: { canView: boolean; canEdit: boolean; canDelete: boolean }[]): ReportAccess | null {
  if (!rows.length) return null;
  const view = rows.some((g) => g.canView) || rows.some((g) => g.canEdit || g.canDelete);
  const edit = rows.some((g) => g.canEdit);
  const del = rows.some((g) => g.canDelete);
  return { view, edit, delete: del, reason: "Granted directly" };
}

/** What this person may do with a saved (custom) report. */
export async function accessForCustom(
  user: AccessUser,
  def: { id: string; createdBy: string | null; visibility: "private" | "shared" | "everyone" },
): Promise<ReportAccess> {
  if (isAdmin(roles(user))) return FULL("Administrator");
  if (def.createdBy && def.createdBy === user.id) return FULL("You created this report");

  const granted = fold(await grantsFor(user, { reportId: def.id }));
  if (granted) return granted;

  // No grant: fall back to the report's own visibility.
  if (def.visibility === "everyone" && canView(roles(user), "reports")) {
    return {
      view: true,
      edit: canEdit(roles(user), "reports") && canBuildReports(roles(user)),
      delete: false,
      reason: "Shared with everyone",
    };
  }
  return { ...NONE, reason: def.visibility === "private" ? "Private to its owner" : "Not shared with you" };
}

/** What this person may do with a built-in report, identified by its slug. */
export async function accessForStandard(user: AccessUser, key: string): Promise<ReportAccess> {
  if (isAdmin(roles(user))) return FULL("Administrator");

  const setting = await db.query.reportSettings.findFirst({
    where: eq(reportSettings.reportKey, key),
    columns: { restricted: true },
  });

  const granted = fold(await grantsFor(user, { reportKey: key }));
  if (granted) return granted;

  if (setting?.restricted) {
    return { ...NONE, reason: "Restricted — access is granted per person or role" };
  }
  if (!canView(roles(user), "reports")) return { ...NONE, reason: "No access to the Reports module" };
  return {
    view: true,
    edit: canEdit(roles(user), "reports"),
    delete: false,
    reason: "Open to everyone who can use Reports",
  };
}

/** Saved reports this person may open, with what they may do to each. */
export async function visibleCustomReports(user: AccessUser) {
  const defs = await db
    .select({
      id: reportDefinitions.id,
      name: reportDefinitions.name,
      description: reportDefinitions.description,
      source: reportDefinitions.source,
      visibility: reportDefinitions.visibility,
      createdBy: reportDefinitions.createdBy,
      updatedAt: reportDefinitions.updatedAt,
    })
    .from(reportDefinitions)
    .orderBy(asc(reportDefinitions.name));

  const out: (typeof defs[number] & { access: ReportAccess })[] = [];
  for (const d of defs) {
    const access = await accessForCustom(user, d);
    if (access.view) out.push({ ...d, access });
  }
  return out;
}

/** Built-in reports this person may open. */
export async function visibleStandardReports(user: AccessUser) {
  const out: { slug: string; name: string; description: string; access: ReportAccess }[] = [];
  for (const r of STANDARD_REPORTS) {
    const access = await accessForStandard(user, r.slug);
    if (access.view) out.push({ slug: r.slug, name: r.name, description: r.description, access });
  }
  return out;
}

/** Guard for a built-in report page. Returns the access, or null when barred. */
export async function checkStandardAccess(user: AccessUser, key: string): Promise<ReportAccess | null> {
  const access = await accessForStandard(user, key);
  return access.view ? access : null;
}

// ---------------------------------------------------------------------------
// Managing grants
// ---------------------------------------------------------------------------

export interface GrantRow {
  id: string;
  role: string | null;
  userId: string | null;
  userName: string | null;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export async function listGrants(opts: { reportId?: string; reportKey?: string }): Promise<GrantRow[]> {
  const where = opts.reportId ? eq(reportGrants.reportId, opts.reportId) : eq(reportGrants.reportKey, opts.reportKey ?? "");
  const rows = await db
    .select({
      id: reportGrants.id,
      role: reportGrants.role,
      userId: reportGrants.userId,
      userName: users.name,
      canView: reportGrants.canView,
      canEdit: reportGrants.canEdit,
      canDelete: reportGrants.canDelete,
    })
    .from(reportGrants)
    .leftJoin(users, eq(users.id, reportGrants.userId))
    .where(where)
    .orderBy(asc(reportGrants.role), asc(users.name));
  return rows;
}

/** Add or replace a grant. One row per grantee per report. */
export async function upsertGrant(
  target: { reportId?: string; reportKey?: string },
  grantee: { role?: string | null; userId?: string | null },
  perms: { view: boolean; edit: boolean; delete: boolean },
  byUserId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!target.reportId && !target.reportKey) return { ok: false, error: "No report given." };
  if (!grantee.role && !grantee.userId) return { ok: false, error: "Choose a role or a person." };
  if (!perms.view && !perms.edit && !perms.delete) {
    // Nothing granted is the same as removing the grant.
    await removeGrantFor(target, grantee);
    return { ok: true };
  }

  const existing = await db
    .select({ id: reportGrants.id })
    .from(reportGrants)
    .where(
      and(
        target.reportId ? eq(reportGrants.reportId, target.reportId) : eq(reportGrants.reportKey, target.reportKey ?? ""),
        grantee.userId ? eq(reportGrants.userId, grantee.userId) : isNull(reportGrants.userId),
        grantee.role ? eq(reportGrants.role, grantee.role) : isNull(reportGrants.role),
      ),
    )
    .limit(1);

  if (existing.length) {
    await db
      .update(reportGrants)
      .set({ canView: perms.view || perms.edit || perms.delete, canEdit: perms.edit, canDelete: perms.delete })
      .where(eq(reportGrants.id, existing[0].id));
    return { ok: true };
  }

  await db.insert(reportGrants).values({
    reportId: target.reportId ?? null,
    reportKey: target.reportKey ?? null,
    role: grantee.role ?? null,
    userId: grantee.userId ?? null,
    canView: perms.view || perms.edit || perms.delete,
    canEdit: perms.edit,
    canDelete: perms.delete,
    createdBy: byUserId,
  });
  return { ok: true };
}

async function removeGrantFor(target: { reportId?: string; reportKey?: string }, grantee: { role?: string | null; userId?: string | null }) {
  await db.delete(reportGrants).where(
    and(
      target.reportId ? eq(reportGrants.reportId, target.reportId) : eq(reportGrants.reportKey, target.reportKey ?? ""),
      grantee.userId ? eq(reportGrants.userId, grantee.userId) : isNull(reportGrants.userId),
      grantee.role ? eq(reportGrants.role, grantee.role) : isNull(reportGrants.role),
    ),
  );
}

export async function removeGrant(grantId: string): Promise<void> {
  await db.delete(reportGrants).where(eq(reportGrants.id, grantId));
}

/** Who may change a report's sharing: its owner, or an administrator. */
export async function canManageSharing(user: AccessUser, def: { createdBy: string | null }): Promise<boolean> {
  return isAdmin(roles(user)) || (!!def.createdBy && def.createdBy === user.id);
}
