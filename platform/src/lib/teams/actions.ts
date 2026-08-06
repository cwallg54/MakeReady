"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { teams, teamMembers } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || !canEdit(user.roles, "administration")) redirect("/403");
  return user;
}

const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function createTeamAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const key = (String(formData.get("key") ?? "").trim() ? slug(String(formData.get("key"))) : slug(name)) || slug(name);
  if (!key) return;
  await db.insert(teams).values({ key, name, description: String(formData.get("description") ?? "").trim() || null }).onConflictDoNothing({ target: teams.key });
  await audit({ userId: user.id, action: "team.create", entityType: "team", entityId: key, metadata: { name } });
  revalidatePath("/admin/teams");
}

export async function toggleTeamAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const t = await db.query.teams.findFirst({ where: eq(teams.id, id), columns: { active: true } });
  if (!t) return;
  await db.update(teams).set({ active: !t.active }).where(eq(teams.id, id));
  revalidatePath("/admin/teams");
}

export async function addTeamMemberAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const teamId = String(formData.get("teamId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  if (!teamId || !userId) return;
  await db.insert(teamMembers).values({ teamId, userId }).onConflictDoNothing({ target: [teamMembers.teamId, teamMembers.userId] });
  await audit({ userId: user.id, action: "team.member_add", entityType: "team", entityId: teamId, metadata: { userId } });
  revalidatePath("/admin/teams");
}

export async function removeTeamMemberAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const teamId = String(formData.get("teamId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  if (!teamId || !userId) return;
  await db.delete(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  await audit({ userId: user.id, action: "team.member_remove", entityType: "team", entityId: teamId, metadata: { userId } });
  revalidatePath("/admin/teams");
}
