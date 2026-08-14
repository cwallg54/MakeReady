import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { recurringJournals, recurringJournalLines, users, userRoles } from "@/db/schema";
import { createJournal, type DraftLine } from "./journal";

function ymOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function anAdmin(): Promise<string | null> {
  const a = await db.select({ id: users.id }).from(users).innerJoin(userRoles, eq(userRoles.userId, users.id)).where(eq(userRoles.role, "admin")).limit(1);
  return a[0]?.id ?? null;
}

/** Post one recurring template for the given month (idempotent via lastPostedYm).
 *  Returns true if it posted. */
export async function postRecurringTemplate(templateId: string, when: Date, userId: string): Promise<boolean> {
  const t = await db.query.recurringJournals.findFirst({ where: eq(recurringJournals.id, templateId) });
  if (!t) return false;
  const ym = ymOf(when);
  if (t.lastPostedYm === ym) return false; // already posted this month
  const lines = await db.select().from(recurringJournalLines).where(eq(recurringJournalLines.templateId, templateId)).orderBy(asc(recurringJournalLines.sortOrder));
  const draft: DraftLine[] = lines.map((l) => ({ accountId: l.accountId, debit: Number(l.debit), credit: Number(l.credit), memo: l.memo }));
  if (draft.length < 2) return false;
  const res = await createJournal(
    { date: when, memo: t.memo || t.name, lines: draft, source: "recurring", sourceId: `${templateId}:${ym}`, post: true },
    userId,
  );
  if (!res.ok) return false;
  await db.update(recurringJournals).set({ lastPostedYm: ym, updatedAt: new Date() }).where(eq(recurringJournals.id, templateId));
  return true;
}

/** Daily cron: post any active recurring template whose day-of-month has arrived
 *  and that hasn't been posted this month yet. */
export async function runRecurringJournals(now: Date): Promise<{ posted: number }> {
  const actorId = await anAdmin();
  if (!actorId) return { posted: 0 };
  const ym = ymOf(now);
  const active = await db.select().from(recurringJournals).where(eq(recurringJournals.active, true));
  let posted = 0;
  for (const t of active) {
    if (t.lastPostedYm === ym) continue; // already posted this month
    if (now.getDate() < t.dayOfMonth) continue; // day not reached yet
    if (await postRecurringTemplate(t.id, now, actorId)) posted++;
  }
  return { posted };
}
