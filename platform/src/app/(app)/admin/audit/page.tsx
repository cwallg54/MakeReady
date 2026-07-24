import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, users } from "@/db/schema";
import { Card } from "@/components/ui";

export default async function AuditPage() {
  const rows = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      createdAt: auditLog.createdAt,
      ip: auditLog.ip,
      userName: users.name,
      userEmail: users.email,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .orderBy(desc(auditLog.createdAt))
    .limit(200);

  return (
    <Card className="p-0">
      <div className="border-b border-neutral-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-neutral-900">Audit log</h2>
        <p className="text-xs text-neutral-500">Most recent 200 events. The audit trail is append-only and cannot be edited.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-5 py-2 font-medium">Time</th>
              <th className="px-5 py-2 font-medium">Action</th>
              <th className="px-5 py-2 font-medium">Actor</th>
              <th className="px-5 py-2 font-medium">Entity</th>
              <th className="px-5 py-2 font-medium">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-neutral-400">
                  No audit events yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap px-5 py-2 text-neutral-500">{r.createdAt.toLocaleString()}</td>
                <td className="px-5 py-2">
                  <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-800">{r.action}</code>
                </td>
                <td className="px-5 py-2 text-neutral-600">{r.userName ?? "System"}</td>
                <td className="px-5 py-2 text-neutral-500">
                  {r.entityType ? `${r.entityType}${r.entityId ? ` · ${r.entityId.slice(0, 8)}` : ""}` : "—"}
                </td>
                <td className="px-5 py-2 text-neutral-400">{r.ip ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
