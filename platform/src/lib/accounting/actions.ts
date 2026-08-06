"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { invoices, invoiceLines, payments, numberSeries, orders, quoteLines, businessPartners, contacts, activities, systemSettings } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView, canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { refreshInvoice, recomputeAccountBalance } from "./ar";
import { postInvoiceToGl, postPaymentToGl, reverseGlForSource } from "./gl-post";
import { generateInvoicePdf } from "./invoice-pdf";
import { generateStatementPdf } from "./statement-pdf";
import { sendInvoiceEmail, sendStatementEmail } from "@/lib/email";
import { fmtDate } from "@/lib/format";

/** Primary contact email for a BP, falling back to the BP's own email. */
async function recipientFor(bpId: string | null): Promise<string> {
  if (!bpId) return "";
  const [bp, contact] = await Promise.all([
    db.query.businessPartners.findFirst({ where: eq(businessPartners.id, bpId), columns: { email: true } }),
    db.query.contacts.findFirst({ where: and(eq(contacts.bpId, bpId), eq(contacts.isPrimary, true)), columns: { email: true } }),
  ]);
  return contact?.email ?? bp?.email ?? "";
}

async function requireAccountingEdit() {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "accounting") || !canEdit(user.roles, "accounting")) redirect("/403");
  return user;
}

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s || null;
}
function num(v: FormDataEntryValue | null): number {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}
/** Days implied by a payment-terms string like "Net 30" (default 30). */
function termsDays(terms: string | null | undefined): number {
  const m = /(\d+)/.exec(terms ?? "");
  return m ? Number(m[1]) : 30;
}

async function defaultTaxRate(): Promise<string> {
  const s = await db.query.systemSettings.findFirst({ columns: { defaultTaxRate: true } });
  return s?.defaultTaxRate ?? "0";
}

async function nextInvoiceNumber(): Promise<string> {
  return db.transaction(async (tx) => {
    let s = await tx.query.numberSeries.findFirst({ where: eq(numberSeries.documentType, "invoice") });
    if (!s) [s] = await tx.insert(numberSeries).values({ documentType: "invoice", prefix: "INV-", nextNumber: 1, padding: 5 }).returning();
    const n = s.nextNumber;
    await tx.update(numberSeries).set({ nextNumber: n + 1, updatedAt: new Date() }).where(eq(numberSeries.id, s.id));
    return `${s.prefix}${String(n).padStart(s.padding, "0")}`;
  });
}

/** Recompute an invoice's stored subtotal/tax/total from its lines, discount,
 *  and tax rate. Tax applies to the discounted subtotal. */
async function recomputeInvoiceTotals(invoiceId: string): Promise<void> {
  const [row] = await db.select({ subtotal: sql<string>`COALESCE(SUM(${invoiceLines.extended}), 0)` }).from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId));
  const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId), columns: { discount: true, taxRate: true } });
  const subtotal = Number(row?.subtotal ?? 0);
  const taxable = subtotal - Number(inv?.discount ?? 0);
  const tax = Math.round(taxable * Number(inv?.taxRate ?? 0) * 100) / 100;
  const total = taxable + tax;
  await db.update(invoices).set({ subtotal: subtotal.toFixed(2), tax: tax.toFixed(2), total: total.toFixed(2), updatedAt: new Date() }).where(eq(invoices.id, invoiceId));
}

// ---- Create ---------------------------------------------------------------

export async function createInvoiceFromOrderAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return;
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!order) return;
  const existing = await db.query.invoices.findFirst({ where: and(eq(invoices.orderId, orderId)) });
  if (existing) redirect(`/accounting/invoices/${existing.id}`);

  const bp = order.bpId ? await db.query.businessPartners.findFirst({ where: eq(businessPartners.id, order.bpId) }) : null;
  const invoiceNumber = await nextInvoiceNumber();
  const [inv] = await db.insert(invoices).values({
    invoiceNumber,
    bpId: order.bpId,
    orderId,
    terms: bp?.paymentTerms ?? "Net 30",
    taxRate: await defaultTaxRate(),
    createdBy: user.id,
  }).returning({ id: invoices.id });

  // Copy the billed lines from the order's quote (fallback to the order amount).
  let lines: { description: string; qty: number; unitPrice: string; extended: string; sortOrder: number }[] = [];
  if (order.quoteId) {
    const qls = await db.select().from(quoteLines).where(eq(quoteLines.quoteId, order.quoteId)).orderBy(quoteLines.sortOrder);
    lines = qls.map((l, i) => ({ description: l.description, qty: l.qty, unitPrice: l.unitPrice, extended: l.extended, sortOrder: i }));
  }
  if (lines.length === 0) lines = [{ description: `Order ${order.orderNumber}`, qty: 1, unitPrice: order.amount, extended: order.amount, sortOrder: 0 }];
  await db.insert(invoiceLines).values(lines.map((l) => ({ invoiceId: inv.id, ...l })));
  await recomputeInvoiceTotals(inv.id);
  await refreshInvoice(inv.id);
  await audit({ userId: user.id, action: "invoice.create_from_order", entityType: "invoice", entityId: inv.id, metadata: { orderId } });
  redirect(`/accounting/invoices/${inv.id}`);
}

export async function createBlankInvoiceAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const bpId = str(formData.get("bpId"));
  const bp = bpId ? await db.query.businessPartners.findFirst({ where: eq(businessPartners.id, bpId) }) : null;
  const invoiceNumber = await nextInvoiceNumber();
  const [inv] = await db.insert(invoices).values({ invoiceNumber, bpId, terms: bp?.paymentTerms ?? "Net 30", taxRate: await defaultTaxRate(), createdBy: user.id }).returning({ id: invoices.id });
  await audit({ userId: user.id, action: "invoice.create", entityType: "invoice", entityId: inv.id });
  redirect(`/accounting/invoices/${inv.id}`);
}

// ---- Edit -----------------------------------------------------------------

export async function updateInvoiceMetaAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const dueStr = String(formData.get("dueDate") ?? "").trim();
  // Accept a tax rate as a percent (e.g. 7.25) and store it as a fraction.
  const taxPct = num(formData.get("taxRatePct"));
  await db.update(invoices).set({
    bpId: str(formData.get("bpId")),
    terms: str(formData.get("terms")),
    dueDate: dueStr ? new Date(dueStr + "T12:00:00") : null,
    discount: String(num(formData.get("discount")).toFixed(2)),
    taxRate: (Math.max(0, taxPct) / 100).toFixed(4),
    notes: str(formData.get("notes")),
    updatedAt: new Date(),
  }).where(eq(invoices.id, id));
  await recomputeInvoiceTotals(id);
  await refreshInvoice(id);
  await audit({ userId: user.id, action: "invoice.update", entityType: "invoice", entityId: id });
  revalidatePath(`/accounting/invoices/${id}`);
}

export async function addInvoiceLineAction(formData: FormData): Promise<void> {
  await requireAccountingEdit();
  const invoiceId = String(formData.get("invoiceId") ?? "");
  if (!invoiceId) return;
  const qty = Math.round(num(formData.get("qty"))) || 1;
  const unitPrice = num(formData.get("unitPrice"));
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId));
  await db.insert(invoiceLines).values({
    invoiceId,
    description: str(formData.get("description")) ?? "(item)",
    qty,
    unitPrice: String(unitPrice.toFixed(2)),
    extended: String((qty * unitPrice).toFixed(2)),
    sortOrder: n,
  });
  await recomputeInvoiceTotals(invoiceId);
  await refreshInvoice(invoiceId);
  revalidatePath(`/accounting/invoices/${invoiceId}`);
}

export async function removeInvoiceLineAction(formData: FormData): Promise<void> {
  await requireAccountingEdit();
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const lineId = String(formData.get("lineId") ?? "");
  if (!invoiceId || !lineId) return;
  await db.delete(invoiceLines).where(and(eq(invoiceLines.id, lineId), eq(invoiceLines.invoiceId, invoiceId)));
  await recomputeInvoiceTotals(invoiceId);
  await refreshInvoice(invoiceId);
  revalidatePath(`/accounting/invoices/${invoiceId}`);
}

// ---- Lifecycle ------------------------------------------------------------

export async function sendInvoiceAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, id) });
  if (!inv || inv.voidedAt) return;
  const issue = inv.issueDate ?? new Date();
  const due = inv.dueDate ?? new Date(issue.getTime() + termsDays(inv.terms) * 86_400_000);
  await db.update(invoices).set({ issueDate: issue, dueDate: due, updatedAt: new Date() }).where(eq(invoices.id, id));
  await refreshInvoice(id);
  await postInvoiceToGl(id, user.id); // Dr AR / Cr Sales — idempotent, best-effort
  if (inv.bpId) {
    await db.insert(activities).values({ bpId: inv.bpId, userId: user.id, type: "note", isSystem: true, content: `Invoice ${inv.invoiceNumber} issued — ${inv.total} due ${due.toLocaleDateString("en-US")}` });
    revalidatePath(`/crm/${inv.bpId}`);
  }
  await audit({ userId: user.id, action: "invoice.send", entityType: "invoice", entityId: id });
  revalidatePath(`/accounting/invoices/${id}`);
}

export async function recordPaymentAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const invoiceId = str(formData.get("invoiceId"));
  const bpId = str(formData.get("bpId"));
  const amount = num(formData.get("amount"));
  if (amount <= 0) return;
  const method = String(formData.get("method") ?? "check");
  const dateStr = String(formData.get("receivedDate") ?? "").trim();
  const [pay] = await db.insert(payments).values({
    invoiceId,
    bpId,
    amount: String(amount.toFixed(2)),
    method: (["check", "ach", "card", "cash", "credit", "other"].includes(method) ? method : "check") as "check" | "ach" | "card" | "cash" | "credit" | "other",
    reference: str(formData.get("reference")),
    receivedDate: dateStr ? new Date(dateStr + "T12:00:00") : new Date(),
    notes: str(formData.get("notes")),
    createdBy: user.id,
  }).returning({ id: payments.id });
  await postPaymentToGl(pay.id, user.id); // Dr Cash / Cr AR — idempotent, best-effort
  if (invoiceId) await refreshInvoice(invoiceId);
  else if (bpId) await recomputeAccountBalance(bpId);
  await audit({ userId: user.id, action: "payment.record", entityType: "invoice", entityId: invoiceId ?? bpId ?? "", metadata: { amount } });
  if (invoiceId) revalidatePath(`/accounting/invoices/${invoiceId}`);
  revalidatePath("/accounting/payments");
  revalidatePath("/accounting");
}

export async function emailInvoiceAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, id) });
  if (!inv || inv.voidedAt) return;
  // Issue the invoice on first email if it hasn't been issued yet.
  if (!inv.issueDate) {
    const due = inv.dueDate ?? new Date(Date.now() + termsDays(inv.terms) * 86_400_000);
    await db.update(invoices).set({ issueDate: new Date(), dueDate: due, updatedAt: new Date() }).where(eq(invoices.id, id));
    await refreshInvoice(id);
    await postInvoiceToGl(id, user.id); // issue-on-email also posts to the GL
  }
  const to = await recipientFor(inv.bpId);
  const pdf = await generateInvoicePdf(id);
  if (pdf && to) {
    const paidTo = await db.select({ s: sql<string>`COALESCE(SUM(${payments.amount}),0)` }).from(payments).where(eq(payments.invoiceId, id));
    const balance = Number(inv.total) - Number(paidTo[0]?.s ?? 0);
    await sendInvoiceEmail(to, inv.invoiceNumber, inv.dueDate ? fmtDate(inv.dueDate) : "", `$${balance.toFixed(2)}`, [{ filename: pdf.filename, content: pdf.base64 }]);
  }
  if (inv.bpId) {
    await db.insert(activities).values({ bpId: inv.bpId, userId: user.id, type: "email", isSystem: true, content: `Invoice ${inv.invoiceNumber} emailed to ${to || "customer (no email on file)"}` });
    revalidatePath(`/crm/${inv.bpId}`);
  }
  await audit({ userId: user.id, action: "invoice.email", entityType: "invoice", entityId: id, metadata: { to } });
  revalidatePath(`/accounting/invoices/${id}`);
}

export async function emailStatementAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const bpId = String(formData.get("bpId") ?? "");
  if (!bpId) return;
  const bp = await db.query.businessPartners.findFirst({ where: eq(businessPartners.id, bpId) });
  if (!bp) return;
  const to = await recipientFor(bpId);
  const pdf = await generateStatementPdf(bpId, new Date());
  if (pdf && to) {
    await sendStatementEmail(to, bp.companyName, `$${Number(bp.accountBalance ?? 0).toFixed(2)}`, [{ filename: pdf.filename, content: pdf.base64 }]);
  }
  await db.insert(activities).values({ bpId, userId: user.id, type: "email", isSystem: true, content: `Account statement emailed to ${to || "customer (no email on file)"}` });
  await audit({ userId: user.id, action: "statement.email", entityType: "business_partner", entityId: bpId, metadata: { to } });
  revalidatePath(`/crm/${bpId}`);
  revalidatePath(`/accounting/statements/${bpId}`);
}

/** Finance sets a customer's credit controls (limit, hold, terms). */
export async function updateCreditControlsAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const bpId = String(formData.get("bpId") ?? "");
  if (!bpId) return;
  const limitStr = String(formData.get("creditLimit") ?? "").trim();
  await db.update(businessPartners).set({
    creditLimit: limitStr ? String(num(formData.get("creditLimit")).toFixed(2)) : null,
    creditHold: formData.get("creditHold") === "on",
    creditHoldReason: str(formData.get("creditHoldReason")),
    paymentTerms: str(formData.get("paymentTerms")),
    personalGuarantee: formData.get("personalGuarantee") === "on",
    updatedAt: new Date(),
  }).where(eq(businessPartners.id, bpId));
  await audit({ userId: user.id, action: "bp.credit_controls", entityType: "business_partner", entityId: bpId });
  revalidatePath(`/reports/standard/credit/${bpId}`);
  revalidatePath(`/crm/${bpId}`);
}

export async function voidInvoiceAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!id) return;
  const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, id) });
  if (!inv || inv.voidedAt) return;
  await db.update(invoices).set({ voidedAt: new Date(), voidReason: reason || "Voided", status: "void", updatedAt: new Date() }).where(eq(invoices.id, id));
  await reverseGlForSource("invoice", id, user.id, `Invoice ${inv.invoiceNumber} voided`); // reverse its GL posting
  if (inv.bpId) await recomputeAccountBalance(inv.bpId);
  await audit({ userId: user.id, action: "invoice.void", entityType: "invoice", entityId: id, metadata: { reason } });
  revalidatePath(`/accounting/invoices/${id}`);
  revalidatePath("/accounting/invoices");
}
