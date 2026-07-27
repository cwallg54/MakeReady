import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { users, userRoles } from "@/db/schema";
import { ROLE_LABELS } from "@/lib/rbac";
import { Card } from "@/components/ui";
import { setUserStatusAction, forceResetAction, deleteUserAction } from "@/lib/admin/actions";
import { ConfirmButton } from "@/components/confirm-button";
import { getCurrentUser } from "@/lib/auth/service";
import { fmtDateTime } from "@/lib/format";
import { UserCreateForm } from "./user-create-form";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const { created } = await searchParams;
  const me = await getCurrentUser();

  const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
  const allRoles = await db.select().from(userRoles);
  const rolesByUser = new Map<string, string[]>();
  for (const r of allRoles) {
    const list = rolesByUser.get(r.userId) ?? [];
    list.push(ROLE_LABELS[r.role]);
    rolesByUser.set(r.userId, list);
  }

  return (
    <div className="space-y-6">
      {created && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          User <strong>{created}</strong> created and sent an invite link.
        </p>
      )}

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-neutral-900">Add a user</h2>
        <UserCreateForm />
      </Card>

      <Card className="p-0">
        <div className="border-b border-neutral-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-neutral-900">Users ({allUsers.length})</h2>
        </div>
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-5 py-2 font-medium">Name</th>
                <th className="px-5 py-2 font-medium">Roles</th>
                <th className="px-5 py-2 font-medium">Status</th>
                <th className="px-5 py-2 font-medium">Last login</th>
                <th className="px-5 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {allUsers.map((u) => (
                <tr key={u.id}>
                  <td className="px-5 py-3">
                    <Link href={`/admin/users/${u.id}`} className="font-medium text-neutral-900 hover:underline">
                      {u.name}
                    </Link>
                    <div className="text-xs text-neutral-500">{u.email}</div>
                  </td>
                  <td className="px-5 py-3 text-neutral-600">
                    {(rolesByUser.get(u.id) ?? []).join(", ") || "—"}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.status === "active"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-neutral-200 text-neutral-600"
                      }`}
                    >
                      {u.status}
                    </span>
                    {u.mustResetPassword && (
                      <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        reset pending
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-neutral-500">
                    {u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "Never"}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <Link href={`/admin/users/${u.id}`} className="text-neutral-600 hover:text-neutral-900">
                        Edit
                      </Link>
                      <form action={forceResetAction}>
                        <input type="hidden" name="id" value={u.id} />
                        <button className="text-neutral-600 hover:text-neutral-900">Force reset</button>
                      </form>
                      {me && u.id === me.id ? (
                        <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">You</span>
                      ) : (
                        <>
                          <form action={setUserStatusAction}>
                            <input type="hidden" name="id" value={u.id} />
                            <input type="hidden" name="status" value={u.status === "active" ? "inactive" : "active"} />
                            <button className={u.status === "active" ? "text-red-600 hover:text-red-800" : "text-emerald-600 hover:text-emerald-800"}>
                              {u.status === "active" ? "Deactivate" : "Activate"}
                            </button>
                          </form>
                          {u.status === "inactive" && (
                            <form action={deleteUserAction}>
                              <input type="hidden" name="id" value={u.id} />
                              <ConfirmButton
                                message={`Permanently delete ${u.email}? This cannot be undone.`}
                                className="text-red-600 hover:text-red-800"
                              >
                                Delete
                              </ConfirmButton>
                            </form>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile card list — row actions live on each user's Edit page */}
        <ul className="divide-y divide-neutral-100 lg:hidden">
          {allUsers.map((u) => (
            <li key={u.id}>
              <Link href={`/admin/users/${u.id}`} className="flex items-start gap-3 px-4 py-3 active:bg-neutral-50">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-neutral-900">{u.name}</p>
                  <p className="truncate text-xs text-neutral-500">{u.email}</p>
                  <p className="mt-0.5 truncate text-xs text-neutral-400">{(rolesByUser.get(u.id) ?? []).join(", ") || "No roles"} · {u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "Never signed in"}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${u.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-neutral-200 text-neutral-600"}`}>{u.status}</span>
                  {u.mustResetPassword && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">reset pending</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
