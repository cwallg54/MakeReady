"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { quotes, quoteLines, quoteCharges, orderFormTemplates, numberSeries } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canEdit, canView } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { priceQuote, type ChargeRule } from "./pricing";

async function requireSalesEdit() {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "sales")) redirect("/403");
  if (!canEdit(user.roles, "sales")) redirect("/403");
  return user;
}

async function nextQuoteNumber(): Promise<string> {
  return db.transaction(async (tx) => {
    let s = await tx.query.numberSeries.findFirst({ where: eq(numberSeries.documentType, "quote") });
    if (!s) {
      [s] = await tx
        .insert(numberSeries)
        .values({ documentType: "quote", prefix: "QUO-", nextNumber: 1, padding: 5 })
        .returning();
    }
    const n = s.nextNumber;
    await tx.update(numberSeries).set({ nextNumber: n + 1, updatedAt: new Date() }).where(eq(numberSeries.id, s.id));
    return `${s.prefix}${String(n).padStart(s.padding, "0")}`;
  });
}

export async function createQuoteAction(formData: FormData): Promise<void> {
  const user = await requireSalesEdit();
  const bpId = String(formData.get("bpId") ?? "") || null;
  const templateId = String(formData.get("templateId") ?? "");
  if (!templateId) redirect("/sales/quotes/new");

  const quoteNumber = await nextQuoteNumber();
  const [q] = await db
    .insert(quotes)
    .values({ quoteNumber, bpId, templateId, createdBy: user.id })
    .returning({ id: quotes.id });
  await audit({ userId: user.id, action: "quote.create", entityType: "quote", entityId: q.id, metadata: { quoteNumber } });
  redirect(`/sales/quotes/${q.id}`);
}

export interface SaveQuotePayload {
  lines: { itemCode?: string; description: string; qty: number; unitPrice: number }[];
  applied: { key: string; inputQty?: number }[];
  isReorder: boolean;
  discount: number;
  notes: string;
}

export async function saveQuoteAction(quoteId: string, payload: SaveQuotePayload): Promise<{ ok: boolean }> {
  const user = await requireSalesEdit();
  const quote = await db.query.quotes.findFirst({ where: eq(quotes.id, quoteId) });
  if (!quote) return { ok: false };
  const template = quote.templateId
    ? await db.query.orderFormTemplates.findFirst({ where: eq(orderFormTemplates.id, quote.templateId) })
    : null;
  const rules = (template?.charges as ChargeRule[] | null) ?? [];

  // Server recomputes all money — never trust client-computed totals.
  const priced = priceQuote({
    lines: payload.lines.filter((l) => l.description || l.qty),
    rules,
    applied: payload.applied,
    isReorder: payload.isReorder,
    discount: payload.discount || 0,
  });

  await db.transaction(async (tx) => {
    await tx.delete(quoteLines).where(eq(quoteLines.quoteId, quoteId));
    await tx.delete(quoteCharges).where(eq(quoteCharges.quoteId, quoteId));
    if (priced.lines.length) {
      await tx.insert(quoteLines).values(
        priced.lines.map((l, i) => ({
          quoteId,
          itemCode: l.itemCode || null,
          description: l.description || "(item)",
          qty: l.qty || 0,
          unitPrice: String(l.unitPrice || 0),
          extended: String(l.extended),
          sortOrder: i,
        })),
      );
    }
    if (priced.charges.length) {
      await tx.insert(quoteCharges).values(
        priced.charges.map((c) => ({
          quoteId,
          key: c.key,
          label: c.label,
          type: c.type,
          rate: String(c.rate),
          inputQty: String(c.inputQty),
          amount: String(c.amount),
        })),
      );
    }
    await tx
      .update(quotes)
      .set({
        isReorder: payload.isReorder,
        discount: String(priced.discount),
        subtotal: String(priced.subtotal),
        chargesTotal: String(priced.chargesTotal),
        total: String(priced.total),
        notes: payload.notes || null,
        updatedAt: new Date(),
      })
      .where(eq(quotes.id, quoteId));
    await audit({ userId: user.id, action: "quote.update", entityType: "quote", entityId: quoteId, metadata: { total: priced.total } }, tx);
  });

  revalidatePath(`/sales/quotes/${quoteId}`);
  revalidatePath("/sales");
  return { ok: true };
}

export async function setQuoteStatusAction(formData: FormData): Promise<void> {
  const user = await requireSalesEdit();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["draft", "sent", "accepted", "rejected", "converted"].includes(status)) return;
  await db
    .update(quotes)
    .set({ status: status as "draft" | "sent" | "accepted" | "rejected" | "converted", updatedAt: new Date() })
    .where(eq(quotes.id, id));
  await audit({ userId: user.id, action: "quote.status", entityType: "quote", entityId: id, metadata: { status } });
  revalidatePath(`/sales/quotes/${id}`);
  revalidatePath("/sales");
}
