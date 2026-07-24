import { and, desc, eq, gte, isNull, lt, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { isAdmin } from "@/lib/rbac";

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return new Response("Forbidden", { status: 403 });

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const actorId = url.searchParams.get("actorId");

  const conditions: SQL[] = [];
  if (from && !Number.isNaN(Date.parse(from))) conditions.push(gte(auditLog.createdAt, new Date(from)));
  if (to && !Number.isNaN(Date.parse(to))) {
    const end = new Date(to);
    end.setDate(end.getDate() + 1); // inclusive of the "to" day
    conditions.push(lt(auditLog.createdAt, end));
  }
  if (actorId === "system") conditions.push(isNull(auditLog.userId));
  else if (actorId) conditions.push(eq(auditLog.userId, actorId));

  const rows = await db
    .select({
      createdAt: auditLog.createdAt,
      action: auditLog.action,
      actorName: users.name,
      actorEmail: users.email,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      ip: auditLog.ip,
      metadata: auditLog.metadata,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.createdAt))
    .limit(50000);

  const header = ["Timestamp", "Action", "Actor", "Actor Email", "Entity Type", "Entity ID", "IP", "Metadata"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.createdAt.toISOString()),
        csvCell(r.action),
        csvCell(r.actorName ?? "System"),
        csvCell(r.actorEmail ?? ""),
        csvCell(r.entityType ?? ""),
        csvCell(r.entityId ?? ""),
        csvCell(r.ip ?? ""),
        csvCell(r.metadata ?? ""),
      ].join(","),
    );
  }
  const csv = lines.join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log-${stamp}.csv"`,
    },
  });
}
