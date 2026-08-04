import "server-only";
import { and, eq, lt, or, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { customerDocuments, businessPartners, contacts, activities, notifications } from "@/db/schema";
import { sendDocumentChaseEmail } from "@/lib/email";
import { DOC_LABELS } from "./meta";

const CHASE_AFTER_DAYS = 3; // wait this long before the first reminder, and between reminders
const MAX_CHASES = 3;

/**
 * Email a reminder for every still-pending document request that's aged past
 * the wait window and hasn't been chased too many times. Notifies the account
 * owner too. Idempotent per run — chaseCount/chasedAt throttle repeats.
 */
export async function chasePendingDocuments(now: Date): Promise<{ chased: number }> {
  const cutoff = new Date(now.getTime() - CHASE_AFTER_DAYS * 86_400_000);
  const rows = await db
    .select({
      id: customerDocuments.id,
      bpId: customerDocuments.bpId,
      docType: customerDocuments.docType,
      token: customerDocuments.token,
      chaseCount: customerDocuments.chaseCount,
      company: businessPartners.companyName,
      ownerId: businessPartners.ownerId,
      bpEmail: businessPartners.email,
    })
    .from(customerDocuments)
    .innerJoin(businessPartners, eq(customerDocuments.bpId, businessPartners.id))
    .where(
      and(
        eq(customerDocuments.status, "pending"),
        lt(customerDocuments.createdAt, cutoff),
        lt(customerDocuments.chaseCount, MAX_CHASES),
        or(isNull(customerDocuments.chasedAt), lt(customerDocuments.chasedAt, cutoff)),
      ),
    );

  const base = process.env.APP_URL ?? "https://makeready.g54.com";
  let chased = 0;
  for (const r of rows) {
    const contact = await db.query.contacts.findFirst({ where: and(eq(contacts.bpId, r.bpId), eq(contacts.isPrimary, true)), columns: { email: true } });
    const to = contact?.email ?? r.bpEmail ?? "";
    const label = DOC_LABELS[r.docType];
    if (to) await sendDocumentChaseEmail(to, label, `${base}/apply/${r.token}`);
    await db.update(customerDocuments).set({ chaseCount: sql`${customerDocuments.chaseCount} + 1`, chasedAt: now }).where(eq(customerDocuments.id, r.id));
    await db.insert(activities).values({ bpId: r.bpId, type: "email", isSystem: true, content: `Auto-chase reminder sent for pending ${label} (reminder ${r.chaseCount + 1} of ${MAX_CHASES})` });
    if (r.ownerId) {
      await db.insert(notifications).values({
        userId: r.ownerId,
        type: "task",
        title: "Credit app still pending",
        body: `${r.company} hasn't returned their ${label}. Reminder ${r.chaseCount + 1} of ${MAX_CHASES} sent${to ? ` to ${to}` : " (no email on file)"}.`,
        link: `/crm/${r.bpId}`,
      });
    }
    chased++;
  }
  return { chased };
}
