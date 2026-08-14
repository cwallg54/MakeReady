import "server-only";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { invoices, invoiceLines, payments, businessPartners, contacts, activities, users, userRoles } from "@/db/schema";
import { sendInvoiceReminderEmail } from "@/lib/email";
import { sendSmsBatch, smsConfigured } from "@/lib/sms/client";
import { postLateFeeToGl } from "./gl-post";
import { refreshInvoice } from "./ar";

const APP = () => process.env.APP_URL ?? "https://makeready.g54.com";
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const fmtUSD = (n: number) => `$${n.toFixed(2)}`;
const dayDiff = (a: Date, b: Date) => Math.floor((a.getTime() - b.getTime()) / 86_400_000);

/**
 * Daily AR reminder run. For each open, issued invoice with a balance, sends one
 * escalating reminder per milestone (upcoming → due soon → overdue), and applies
 * a one-time late fee once past due by the configured days. Deduped via each
 * invoice's `remindersSent`. Best-effort — email/SMS failures don't stop the run.
 */
export async function runArReminders(now: Date): Promise<{ reminders: number; lateFees: number }> {
  const settings = await db.query.systemSettings.findFirst({ columns: { lateFeePct: true, lateFeeDays: true } });
  const lateFeePct = Number(settings?.lateFeePct ?? 0);
  const lateFeeDays = Number(settings?.lateFeeDays ?? 15);
  const admin = await db.select({ id: users.id }).from(users).innerJoin(userRoles, eq(userRoles.userId, users.id)).where(eq(userRoles.role, "admin")).limit(1);
  const actorId = admin[0]?.id ?? null;

  const open = await db
    .select()
    .from(invoices)
    .where(and(isNull(invoices.voidedAt), ne(invoices.status, "paid"), ne(invoices.status, "void")));

  let reminders = 0;
  let lateFees = 0;

  for (const inv of open) {
    if (!inv.issueDate || !inv.dueDate) continue; // only issued, dated invoices
    const paidRow = await db.select({ s: sql<string>`COALESCE(SUM(${payments.amount}),0)` }).from(payments).where(eq(payments.invoiceId, inv.id));
    let balance = Number(inv.total) - Number(paidRow[0]?.s ?? 0);
    if (balance <= 0.005) continue;

    const sent = new Set<string>(Array.isArray(inv.remindersSent) ? (inv.remindersSent as string[]) : []);
    const daysToDue = dayDiff(inv.dueDate, now); // >0 upcoming, <0 overdue
    const daysPast = -daysToDue;

    // Resolve recipient contact.
    const [contact, bp] = await Promise.all([
      inv.bpId ? db.query.contacts.findFirst({ where: and(eq(contacts.bpId, inv.bpId), eq(contacts.isPrimary, true)), columns: { email: true, phone: true } }) : Promise.resolve(undefined),
      inv.bpId ? db.query.businessPartners.findFirst({ where: eq(businessPartners.id, inv.bpId), columns: { email: true, phone: true } }) : Promise.resolve(undefined),
    ]);
    const email = (contact?.email ?? bp?.email ?? "").trim();
    const phone = (contact?.phone ?? bp?.phone ?? "").trim();
    const payUrl = inv.publicToken ? `${APP()}/invoice/${inv.publicToken}` : `${APP()}/accounting/invoices/${inv.id}`;
    const dueLabel = inv.dueDate.toLocaleDateString("en-US");

    // Apply the one-time late fee first (past the threshold, not yet applied).
    if (lateFeePct > 0 && daysPast >= lateFeeDays && !sent.has("latefee")) {
      const fee = round2(balance * (lateFeePct / 100));
      if (fee > 0) {
        const order = (await db.select({ id: invoiceLines.id }).from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id))).length;
        await db.insert(invoiceLines).values({ invoiceId: inv.id, description: `Late fee (${lateFeePct}% — ${daysPast} days past due)`, qty: 1, unitPrice: fee.toFixed(2), extended: fee.toFixed(2), sortOrder: order });
        await db.update(invoices).set({ total: (Number(inv.total) + fee).toFixed(2), updatedAt: new Date() }).where(eq(invoices.id, inv.id));
        if (actorId) await postLateFeeToGl(inv.id, fee, actorId);
        await refreshInvoice(inv.id);
        balance = round2(balance + fee);
        sent.add("latefee");
        lateFees++;
        if (inv.bpId) await db.insert(activities).values({ bpId: inv.bpId, userId: actorId, type: "note", isSystem: true, content: `Late fee ${fmtUSD(fee)} applied to invoice ${inv.invoiceNumber} (${daysPast} days past due)` });
      }
    }

    // Pick the single most-urgent unsent reminder milestone.
    let key: string | null = null;
    let headline = "";
    if (daysToDue < 0 && !sent.has("overdue")) { key = "overdue"; headline = `is past due (${daysPast} day${daysPast === 1 ? "" : "s"})`; }
    else if (daysToDue >= 0 && daysToDue <= 5 && !sent.has("duesoon")) { key = "duesoon"; headline = daysToDue === 0 ? "is due today" : `is due in ${daysToDue} day${daysToDue === 1 ? "" : "s"}`; }
    else if (daysToDue > 5 && daysToDue <= 15 && !sent.has("before")) { key = "before"; headline = `is due soon (${daysToDue} days)`; }

    if (key) {
      if (email) await sendInvoiceReminderEmail(email, inv.invoiceNumber, headline, fmtUSD(balance), dueLabel, payUrl);
      if (smsConfigured() && phone) await sendSmsBatch([phone], `Great Mountain West: invoice ${inv.invoiceNumber} ${headline} — balance ${fmtUSD(balance)}. Pay: ${payUrl}`);
      sent.add(key);
      reminders++;
      if (inv.bpId) await db.insert(activities).values({ bpId: inv.bpId, userId: actorId, type: "email", isSystem: true, content: `Payment reminder sent for invoice ${inv.invoiceNumber} — ${headline} (${email || "no email"})` });
    }

    if (key || sent.has("latefee")) {
      await db.update(invoices).set({ remindersSent: Array.from(sent) }).where(eq(invoices.id, inv.id));
    }
  }

  return { reminders, lateFees };
}
