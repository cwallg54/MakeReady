import Link from "next/link";
import { and, asc, desc, eq, gte, isNull, lt, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, users } from "@/db/schema";
import { Card } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; actorId?: string }>;
}) {
  const { from, to, actorId } = await searchParams;

  const conditions: SQL[] = [];
  if (from && !Number.isNaN(Date.parse(from))) conditions.push(gte(auditLog.createdAt, new Date(from)));
  if (to && !Number.isNaN(Date.parse(to))) {
    const end = new Date(to);
    end.setDate(end.getDate() + 1);
    conditions.push(lt(auditLog.createdAt, end));
  }
  if (actorId === "system") conditions.push(isNull(auditLog.userId));
  else if (actorId) conditions.push(eq(auditLog.userId, actorId));

  const [rows, actors] = await Promise.all([
    db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        createdAt: auditLog.createdAt,
        ip: auditLog.ip,
        userName: users.name,
      })
      .from(auditLog)
      .leftJoin(users, eq(auditLog.userId, users.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(auditLog.createdAt))
      .limit(500),
    db.select({ id: users.id, name: users.name }).from(users).orderBy(asc(users.name)),
  ]);

  const exportParams = new URLSearchParams();
  if (from) exportParams.set("from", from);
  if (to) exportParams.set("to", to);
  if (actorId) exportParams.set("actorId", actorId);
  const exportHref = `/admin/audit/export${exportParams.toString() ? `?${exportParams}` : ""}`;
  const inputCls = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-neutral-500";

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-neutral-200 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Audit log</h2>
          <p className="text-xs text-neutral-500">Append-only. Retained ≥ 13 months for PCI DSS / SOC 2. Showing latest 500 matches.</p>
        </div>
        <form className="flex flex-wrap items-end gap-2" action="/admin/audit">
          <label className="flex flex-col text-xs text-neutral-500">From<input type="date" name="from" defaultValue={from ?? ""} className={inputCls} /></label>
          <label className="flex flex-col text-xs text-neutral-500">To<input type="date" name="to" defaultValue={to ?? ""} className={inputCls} /></label>
          <label className="flex flex-col text-xs text-neutral-500">
            Actor
            <select name="actorId" defaultValue={actorId ?? ""} className={inputCls}>
              <option value="">Anyone</option>
              <option value="system">System (automated)</option>
              {actors.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>
          <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">Search</button>
          <Link href="/admin/audit" className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50">Clear</Link>
          <a href={exportHref} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Export CSV</a>
        </form>
      </div>
      <div className="hidden overflow-x-auto lg:block">
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
              <tr><td colSpan={5} className="px-5 py-6 text-center text-neutral-400">No matching audit events.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap px-5 py-2 text-neutral-500">{fmtDateTime(r.createdAt)}</td>
                <td className="px-5 py-2"><code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-800">{r.action}</code></td>
                <td className="px-5 py-2 text-neutral-600">{r.userName ?? "System"}</td>
                <td className="px-5 py-2 text-neutral-500">{r.entityType ? `${r.entityType}${r.entityId ? ` · ${r.entityId.slice(0, 8)}` : ""}` : "—"}</td>
                <td className="px-5 py-2 text-neutral-400">{r.ip ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <ul className="divide-y divide-neutral-100 lg:hidden">
        {rows.length === 0 && <li className="px-4 py-6 text-center text-sm text-neutral-400">No matching audit events.</li>}
        {rows.map((r) => (
          <li key={r.id} className="px-4 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-800">{r.action}</code>
              <span className="shrink-0 text-xs text-neutral-400">{fmtDateTime(r.createdAt)}</span>
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              {r.userName ?? "System"}
              {r.entityType ? ` · ${r.entityType}${r.entityId ? ` ${r.entityId.slice(0, 8)}` : ""}` : ""}
              {r.ip ? ` · ${r.ip}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
