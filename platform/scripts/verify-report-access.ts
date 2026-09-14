import { config } from "dotenv";
config({ path: ".env.local" });

import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { reportDefinitions, reportGrants, reportSettings, userRoles, users } from "../src/db/schema";
import {
  accessForCustom,
  accessForStandard,
  upsertGrant,
  visibleCustomReports,
  visibleStandardReports,
  type AccessUser,
} from "../src/lib/reports/access";

/**
 * Prove the report permission rules hold: a private report stays private, a
 * grant opens exactly what it says and nothing more, and restricting a built-in
 * report hides it from everyone who was not granted it.
 *
 * Creates scratch users and a scratch report, then removes them.
 *
 * Run: pnpm verify:report-access
 */
let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const stamp = Date.now();
  const mk = async (name: string, role: "admin" | "sales_manager" | "finance" | "production") => {
    const [u] = await db
      .insert(users)
      .values({ name, email: `zz-${role}-${stamp}@example.test`, passwordHash: "x", status: "active" })
      .returning({ id: users.id });
    await db.insert(userRoles).values({ userId: u.id, role });
    return { id: u.id, roles: [role] } as AccessUser;
  };

  const admin = await mk("ZZ Admin", "admin");
  const owner = await mk("ZZ Owner", "sales_manager");
  const other = await mk("ZZ Other", "finance");
  const outsider = await mk("ZZ Outsider", "production");
  // Every role carries Reports view, so the only account with no module access
  // at all is one with no role assigned.
  const [noRole] = await db
    .insert(users)
    .values({ name: "ZZ No Role", email: `zz-norole-${stamp}@example.test`, passwordHash: "x", status: "active" })
    .returning({ id: users.id });
  const roleless: AccessUser = { id: noRole.id, roles: [] };

  const [def] = await db
    .insert(reportDefinitions)
    .values({
      name: `ZZ access test ${stamp}`,
      source: "business_partners",
      config: { columns: ["companyName"], filters: [] },
      visibility: "private",
      createdBy: owner.id,
    })
    .returning({ id: reportDefinitions.id });
  const report = { id: def.id, createdBy: owner.id, visibility: "private" as const };

  // ---- private ----
  check("owner has full access to their own report", (await accessForCustom(owner, report)).delete);
  check("admin has full access to anyone's report", (await accessForCustom(admin, report)).delete);
  const otherPrivate = await accessForCustom(other, report);
  check("a private report is hidden from everyone else", !otherPrivate.view, otherPrivate.reason);

  // ---- shared with everyone ----
  const everyone = { ...report, visibility: "everyone" as const };
  check("shared-with-everyone is readable in the Reports module", (await accessForCustom(other, everyone)).view);
  check("shared-with-everyone does not confer delete", !(await accessForCustom(other, everyone)).delete);
  const rolelessEveryone = await accessForCustom(roleless, everyone);
  check("an account with no roles still cannot see it", !rolelessEveryone.view, rolelessEveryone.reason);

  // ---- an explicit read grant on a private report ----
  await upsertGrant({ reportId: def.id }, { userId: other.id }, { view: true, edit: false, delete: false }, admin.id);
  const granted = await accessForCustom(other, report);
  check("a read grant opens a private report", granted.view, granted.reason);
  check("a read grant does not confer write", !granted.edit);
  check("a read grant does not confer delete", !granted.delete);

  // ---- upgrading that grant to write ----
  await upsertGrant({ reportId: def.id }, { userId: other.id }, { view: true, edit: true, delete: false }, admin.id);
  const upgraded = await accessForCustom(other, report);
  check("upgrading the grant confers write", upgraded.edit);
  check("write still does not confer delete", !upgraded.delete);

  // ---- a role grant reaches everyone holding the role ----
  await upsertGrant({ reportId: def.id }, { role: "production" }, { view: true, edit: false, delete: false }, admin.id);
  check("a role grant reaches a holder of that role", (await accessForCustom(outsider, report)).view);

  // ---- the catalogue itself is filtered ----
  const ownerList = await visibleCustomReports(owner);
  const outsiderList = await visibleCustomReports(outsider);
  check("the owner sees their report in the list", ownerList.some((r) => r.id === def.id));
  check("a granted person sees it in the list", outsiderList.some((r) => r.id === def.id));

  // Revoke and confirm it disappears again.
  await db.delete(reportGrants).where(eq(reportGrants.reportId, def.id));
  const afterRevoke = await visibleCustomReports(outsider);
  check("revoking removes it from the list again", !afterRevoke.some((r) => r.id === def.id));

  // ---- built-in reports ----
  const KEY = "credit";
  const openToAll = await accessForStandard(other, KEY);
  check("a built-in report is open to the Reports module by default", openToAll.view, openToAll.reason);

  await db
    .insert(reportSettings)
    .values({ reportKey: KEY, restricted: true })
    .onConflictDoUpdate({ target: reportSettings.reportKey, set: { restricted: true } });

  const restricted = await accessForStandard(other, KEY);
  check("restricting hides a built-in report", !restricted.view, restricted.reason);
  check("an administrator still sees a restricted report", (await accessForStandard(admin, KEY)).view);

  const visibleBefore = await visibleStandardReports(other);
  check("a restricted report drops out of the catalogue", !visibleBefore.some((r) => r.slug === KEY));

  await upsertGrant({ reportKey: KEY }, { role: "finance" }, { view: true, edit: false, delete: false }, admin.id);
  const regranted = await accessForStandard(other, KEY);
  check("granting a role restores access to a restricted report", regranted.view, regranted.reason);
  const visibleAfter = await visibleStandardReports(other);
  check("and it returns to the catalogue", visibleAfter.some((r) => r.slug === KEY));

  // ---- clean up -------------------------------------------------------------
  await db.delete(reportGrants).where(eq(reportGrants.reportKey, KEY));
  await db.delete(reportSettings).where(eq(reportSettings.reportKey, KEY));
  await db.delete(reportDefinitions).where(eq(reportDefinitions.id, def.id));
  const ids = [admin.id, owner.id, other.id, outsider.id, roleless.id];
  await db.delete(userRoles).where(inArray(userRoles.userId, ids));
  await db.delete(users).where(inArray(users.id, ids));
  console.log("\nscratch users, report and grants removed");

  console.log(failures === 0 ? "Report access rules verified." : `${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
