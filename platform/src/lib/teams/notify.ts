import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { teams, teamMembers, users, userRoles, notifications, type Role } from "@/db/schema";

export interface TeamNote {
  type: string;
  title: string;
  body?: string;
  link?: string;
}

/** Resolve the active users who should receive work/alerts for a team key.
 *  Prefers the team's active members; if the team is missing/empty, falls back
 *  to everyone holding one of the given roles (so nothing goes unrouted). */
export async function teamRecipientIds(key: string, fallbackRoles: Role[] = []): Promise<string[]> {
  const team = await db.query.teams.findFirst({ where: and(eq(teams.key, key), eq(teams.active, true)) });
  if (team) {
    const rows = await db
      .select({ id: teamMembers.userId })
      .from(teamMembers)
      .innerJoin(users, eq(users.id, teamMembers.userId))
      .where(and(eq(teamMembers.teamId, team.id), eq(users.status, "active")));
    const ids = Array.from(new Set(rows.map((r) => r.id)));
    if (ids.length) return ids;
  }
  if (!fallbackRoles.length) return [];
  const roleRows = await db.select({ id: userRoles.userId }).from(userRoles).where(inArray(userRoles.role, fallbackRoles));
  return Array.from(new Set(roleRows.map((r) => r.id)));
}

/** Notify a team's members (or role fallback). Returns how many were notified. */
export async function notifyTeam(key: string, note: TeamNote, fallbackRoles: Role[] = []): Promise<number> {
  const ids = await teamRecipientIds(key, fallbackRoles);
  if (!ids.length) return 0;
  await db.insert(notifications).values(
    ids.map((userId) => ({ userId, type: note.type, title: note.title, body: note.body ?? null, link: note.link ?? null })),
  );
  return ids.length;
}
