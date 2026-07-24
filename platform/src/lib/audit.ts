import { db } from "@/db";
import { auditLog } from "@/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface AuditInput {
  userId?: string | null;
  action: string; // e.g. "auth.login", "user.create", "config.update"
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
}

/**
 * Append an entry to the immutable audit log. Every write operation must call
 * this. Pass a transaction (`tx`) to make the audit entry atomic with the write.
 */
export async function audit(input: AuditInput, tx?: Tx): Promise<void> {
  const runner = tx ?? db;
  await runner.insert(auditLog).values({
    userId: input.userId ?? null,
    action: input.action,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    metadata: input.metadata ?? null,
    ip: input.ip ?? null,
  });
}
