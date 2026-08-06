import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { teams, teamMembers, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canEdit } from "@/lib/rbac";
import { Card } from "@/components/ui";
import { createTeamAction, toggleTeamAction, addTeamMemberAction, removeTeamMemberAction } from "@/lib/teams/actions";

export const dynamic = "force-dynamic";
const inp = "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand";

export default async function TeamsPage() {
  const me = await getCurrentUser();
  if (!me || !canEdit(me.roles, "administration")) redirect("/403");

  const [teamRows, memberRows, activeUsers] = await Promise.all([
    db.select().from(teams).orderBy(asc(teams.name)),
    db.select({ teamId: teamMembers.teamId, userId: teamMembers.userId, name: users.name, email: users.email })
      .from(teamMembers).innerJoin(users, eq(users.id, teamMembers.userId)),
    db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.status, "active")).orderBy(asc(users.name)),
  ]);

  const membersByTeam = new Map<string, { userId: string; name: string; email: string }[]>();
  for (const m of memberRows) {
    const list = membersByTeam.get(m.teamId) ?? [];
    list.push({ userId: m.userId, name: m.name, email: m.email });
    membersByTeam.set(m.teamId, list);
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="mb-1 text-sm font-semibold text-neutral-900">Teams &amp; routing groups</h2>
        <p className="mb-4 text-xs text-neutral-500">Route work and alerts to a group of people instead of one person — for coverage, visibility, and reporting. When a team has members, notifications go to them; otherwise they fall back to the matching role.</p>
        <form action={createTeamAction} className="flex flex-wrap items-end gap-2">
          <label className="flex-1 min-w-[10rem]"><span className="mb-1 block text-xs font-medium text-neutral-600">Team name</span><input name="name" required placeholder="Purchasing" className={`w-full ${inp}`} /></label>
          <label><span className="mb-1 block text-xs font-medium text-neutral-600">Key <span className="text-neutral-400">optional</span></span><input name="key" placeholder="purchasing" className={`w-40 font-mono ${inp}`} /></label>
          <label className="flex-1 min-w-[10rem]"><span className="mb-1 block text-xs font-medium text-neutral-600">Description</span><input name="description" placeholder="What this team handles" className={`w-full ${inp}`} /></label>
          <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Add team</button>
        </form>
        <p className="mt-2 text-xs text-neutral-400">Known routing keys: <span className="font-mono">purchasing</span> (reorder alerts), <span className="font-mono">art</span>, <span className="font-mono">production</span> (job hand-offs).</p>
      </Card>

      {teamRows.length === 0 && <p className="text-sm text-neutral-400">No teams yet. Add one above.</p>}

      {teamRows.map((t) => {
        const members = membersByTeam.get(t.id) ?? [];
        const memberIds = new Set(members.map((m) => m.userId));
        const addable = activeUsers.filter((u) => !memberIds.has(u.id));
        return (
          <Card key={t.id}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className={`text-sm font-semibold ${t.active ? "text-neutral-900" : "text-neutral-400 line-through"}`}>{t.name} <span className="ml-1 font-mono text-xs text-neutral-400">{t.key}</span></h3>
                {t.description && <p className="text-xs text-neutral-500">{t.description}</p>}
              </div>
              <form action={toggleTeamAction}><input type="hidden" name="id" value={t.id} /><button className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50">{t.active ? "Disable" : "Enable"}</button></form>
            </div>

            <ul className="mt-3 divide-y divide-neutral-100 rounded-md border border-neutral-200">
              {members.length === 0 && <li className="px-3 py-2 text-xs text-neutral-400">No members — alerts fall back to the matching role.</li>}
              {members.map((m) => (
                <li key={m.userId} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-neutral-800">{m.name} <span className="text-xs text-neutral-400">{m.email}</span></span>
                  <form action={removeTeamMemberAction}><input type="hidden" name="teamId" value={t.id} /><input type="hidden" name="userId" value={m.userId} /><button className="text-xs font-medium text-red-600 hover:text-red-800">Remove</button></form>
                </li>
              ))}
            </ul>

            {addable.length > 0 && (
              <form action={addTeamMemberAction} className="mt-2 flex items-end gap-2">
                <input type="hidden" name="teamId" value={t.id} />
                <label className="flex-1"><span className="mb-1 block text-xs font-medium text-neutral-600">Add member</span>
                  <select name="userId" required defaultValue="" className={`w-full ${inp}`}>
                    <option value="" disabled>Choose a user…</option>
                    {addable.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                  </select>
                </label>
                <button className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">Add</button>
              </form>
            )}
          </Card>
        );
      })}
    </div>
  );
}
