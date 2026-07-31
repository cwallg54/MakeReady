"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { quotes, quoteLines, quoteCharges, quoteAttachments, orderFormTemplates, templateItems, numberSeries, activities, orders, orderEvents, orderAttachments, businessPartners } from "@/db/schema";
import { randomBytes } from "crypto";
import { getCurrentUser } from "@/lib/auth/service";
import { canEdit, canView } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { priceQuote, resolveUnitPrice, sizeUpcharge, type ChargeRule, type PriceBreak } from "./pricing";

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
  // Log to the customer's CRM history.
  if (bpId) {
    await db.insert(activities).values({ bpId, userId: user.id, type: "other", isSystem: true, content: `Quote ${quoteNumber} created` });
    revalidatePath(`/crm/${bpId}`);
  }
  redirect(`/sales/quotes/${q.id}`);
}

/** Delete a quote — only permitted while it is still a draft. */
export async function deleteQuoteAction(formData: FormData): Promise<void> {
  const user = await requireSalesEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const quote = await db.query.quotes.findFirst({ where: eq(quotes.id, id) });
  if (!quote) redirect("/sales");
  if (quote.status !== "draft") redirect(`/sales/quotes/${id}`); // only drafts are deletable

  await db.delete(quotes).where(eq(quotes.id, id)); // lines/charges cascade
  if (quote.bpId) {
    await db.insert(activities).values({ bpId: quote.bpId, userId: user.id, type: "other", isSystem: true, content: `Draft quote ${quote.quoteNumber} deleted` });
    revalidatePath(`/crm/${quote.bpId}`);
  }
  await audit({ userId: user.id, action: "quote.delete", entityType: "quote", entityId: id, metadata: { quoteNumber: quote.quoteNumber } });
  revalidatePath("/sales");
  redirect("/sales");
}

export interface SaveQuotePayload {
  lines: { itemCode?: string; description: string; size?: string; qty: number; unitPrice: number }[];
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

  // Catalog items (keyed by code or name) are the pricing source of truth: for any
  // line that maps to one with quantity bands or size upcharges, the server derives
  // the unit price from the band + size — never trusting the client's figure.
  const catalog = template
    ? await db.select().from(templateItems).where(eq(templateItems.templateId, template.id))
    : [];
  const itemByKey = new Map(catalog.map((it) => [it.code ?? it.name, it]));

  const resolvedLines = payload.lines
    .filter((l) => l.description || l.qty)
    .map((l) => {
      const item = l.itemCode ? itemByKey.get(l.itemCode) : itemByKey.get(l.description);
      const breaks = (item?.priceBreaks as PriceBreak[] | null) ?? null;
      const upcharges = (item?.sizeUpcharges as Record<string, number> | null) ?? null;
      const autoPriced = !!item && ((breaks?.length ?? 0) > 0 || (upcharges ? Object.keys(upcharges).length > 0 : false));
      const unitPrice = autoPriced
        ? resolveUnitPrice(breaks, l.qty, Number(item!.unitPrice)) + sizeUpcharge(upcharges, l.size)
        : l.unitPrice;
      return { ...l, unitPrice };
    });

  // Server recomputes all money — never trust client-computed totals.
  const priced = priceQuote({
    lines: resolvedLines,
    rules,
    applied: payload.applied,
    isReorder: payload.isReorder,
    discount: payload.discount || 0,
  });

  // Preserve each priced line's chosen size for persistence (priceQuote drops unknown fields).
  const sizeByIndex = resolvedLines.map((l) => l.size ?? null);

  await db.transaction(async (tx) => {
    await tx.delete(quoteLines).where(eq(quoteLines.quoteId, quoteId));
    await tx.delete(quoteCharges).where(eq(quoteCharges.quoteId, quoteId));
    if (priced.lines.length) {
      await tx.insert(quoteLines).values(
        priced.lines.map((l, i) => ({
          quoteId,
          itemCode: l.itemCode || null,
          description: l.description || "(item)",
          size: sizeByIndex[i],
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

export async function logQuoteEmailedAction(quoteId: string): Promise<void> {
  const user = await requireSalesEdit();
  const quote = await db.query.quotes.findFirst({ where: eq(quotes.id, quoteId) });
  if (!quote) return;
  if (quote.bpId) {
    await db.insert(activities).values({
      bpId: quote.bpId,
      userId: user.id,
      type: "email",
      isSystem: true,
      content: `Quote ${quote.quoteNumber} emailed to customer`,
    });
    revalidatePath(`/crm/${quote.bpId}`);
  }
  if (quote.status === "draft") {
    await db.update(quotes).set({ status: "sent", updatedAt: new Date() }).where(eq(quotes.id, quoteId));
  }
  await audit({ userId: user.id, action: "quote.emailed", entityType: "quote", entityId: quoteId });
  revalidatePath(`/sales/quotes/${quoteId}`);
  revalidatePath("/sales");
}

export async function setQuoteCustomerAction(formData: FormData): Promise<void> {
  const user = await requireSalesEdit();
  const id = String(formData.get("id") ?? "");
  const bpId = String(formData.get("bpId") ?? "") || null;
  if (!id) return;
  await db.update(quotes).set({ bpId, updatedAt: new Date() }).where(eq(quotes.id, id));
  await audit({ userId: user.id, action: "quote.set_customer", entityType: "quote", entityId: id, metadata: { bpId } });
  revalidatePath(`/sales/quotes/${id}`);
  revalidatePath("/sales");
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

  // Converting a quote spawns a trackable order (once).
  if (status === "converted") {
    const quote = await db.query.quotes.findFirst({ where: eq(quotes.id, id) });
    const existing = await db.query.orders.findFirst({ where: eq(orders.quoteId, id) });
    if (quote && !existing) {
      const orderNumber = await nextSalesOrderNumber();
      const publicToken = randomBytes(16).toString("hex");
      // Credit the account owner as the sales rep, and fix the order value from
      // the quote total, so the standard sales/open-order reports have data.
      const bp = quote.bpId
        ? await db.query.businessPartners.findFirst({ where: eq(businessPartners.id, quote.bpId), columns: { ownerId: true } })
        : null;
      const [o] = await db
        .insert(orders)
        .values({
          orderNumber,
          bpId: quote.bpId,
          quoteId: id,
          publicToken,
          stage: "received",
          createdBy: user.id,
          amount: quote.total ?? "0",
          salesRepId: bp?.ownerId ?? user.id,
        })
        .returning({ id: orders.id });
      await db.insert(orderEvents).values({ orderId: o.id, stage: "received", byUserId: user.id });

      // Carry the catalogue images of the quoted items into the order, so the
      // art department sees exactly what the customer picked from the catalogue.
      const qLines = await db.select().from(quoteLines).where(eq(quoteLines.quoteId, id));
      const codes = new Set(qLines.map((l) => l.itemCode).filter((c): c is string => !!c));
      if (codes.size && quote.templateId) {
        const items = await db.select().from(templateItems).where(eq(templateItems.templateId, quote.templateId));
        const picked = items.filter((it) => it.imageBase64 && it.code && codes.has(it.code));
        if (picked.length) {
          await db.insert(orderAttachments).values(
            picked.map((it) => ({
              orderId: o.id,
              filename: `catalog-${(it.code ?? it.name).replace(/[^a-z0-9]+/gi, "-")}.${(it.imageMimeType ?? "image/png").split("/")[1] ?? "png"}`,
              mimeType: it.imageMimeType ?? "image/png",
              kind: "catalog",
              contentBase64: it.imageBase64!,
              notes: `Catalogue image — ${it.name}`,
              uploadedBy: user.id,
            })),
          );
        }
      }
      // Carry the customer's intake files (art/reference) onto the order so the
      // art department picks them up automatically.
      const qAtt = await db.select().from(quoteAttachments).where(eq(quoteAttachments.quoteId, id));
      if (qAtt.length) {
        await db.insert(orderAttachments).values(
          qAtt.map((a) => ({
            orderId: o.id,
            filename: a.filename,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
            kind: a.kind,
            contentBase64: a.contentBase64,
            notes: a.notes,
            uploadedBy: a.uploadedBy,
          })),
        );
      }
      if (quote.bpId) {
        await db.insert(activities).values({ bpId: quote.bpId, type: "other", isSystem: true, content: `Order ${orderNumber} created from quote ${quote.quoteNumber}` });
        revalidatePath(`/crm/${quote.bpId}`);
      }
      await audit({ userId: user.id, action: "order.create", entityType: "order", entityId: o.id, metadata: { orderNumber } });
    }
  }

  revalidatePath(`/sales/quotes/${id}`);
  revalidatePath("/sales");
}

async function nextSalesOrderNumber(): Promise<string> {
  return db.transaction(async (tx) => {
    let s = await tx.query.numberSeries.findFirst({ where: eq(numberSeries.documentType, "sales_order") });
    if (!s) {
      [s] = await tx.insert(numberSeries).values({ documentType: "sales_order", prefix: "SO-", nextNumber: 1, padding: 5 }).returning();
    }
    const n = s.nextNumber;
    await tx.update(numberSeries).set({ nextNumber: n + 1, updatedAt: new Date() }).where(eq(numberSeries.id, s.id));
    return `${s.prefix}${String(n).padStart(s.padding, "0")}`;
  });
}
