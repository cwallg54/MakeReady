import { asc } from "drizzle-orm";
import { db } from "@/db";
import { accountGroups } from "@/db/schema";
import { Card } from "@/components/ui";
import { GroupCreateForm } from "./group-create-form";

export default async function AccountGroupsPage() {
  const groups = await db.select().from(accountGroups).orderBy(asc(accountGroups.name));

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <h2 className="mb-4 text-sm font-semibold text-neutral-900">Add account group</h2>
        <GroupCreateForm />
      </Card>

      <Card className="p-0">
        <div className="border-b border-neutral-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-neutral-900">Account groups ({groups.length})</h2>
          <p className="text-xs text-neutral-500">Control the pricing tier and Web Store catalog a Business Partner sees.</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-5 py-2 font-medium">Code</th>
              <th className="px-5 py-2 font-medium">Name</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {groups.length === 0 && (
              <tr>
                <td colSpan={2} className="px-5 py-6 text-center text-neutral-400">No account groups yet.</td>
              </tr>
            )}
            {groups.map((g) => (
              <tr key={g.id}>
                <td className="px-5 py-3 font-mono text-xs text-neutral-500">{g.code}</td>
                <td className="px-5 py-3 text-neutral-800">{g.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
