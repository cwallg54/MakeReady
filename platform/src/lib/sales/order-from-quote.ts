import "server-only";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@/db";
import { advanceLifecycle } from "@/lib/crm/lifecycle";
import {
  quotes, quoteLines, quoteAttachments, orders, orderEvents, orderAttachments, orderSpecItems,
  businessPartners, numberSeries, templateItems, printLocations, decorationMethods, activities, pricingExtras,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import type { DecorationInput } from "./pricing";

export async function nextSalesOrderNumber(): Promise<string> {
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

/**
 * Spawn a trackable order from a quote (once). Shared by staff conversion and
 * the public customer-approval flow. `byUserId` is the acting user (the rep, or
 * null for a public approval). Returns the new order id, or null if the quote is
 * missing or already has an order.
 */
export async function createOrderFromQuote(quoteId: string, byUserId: string | null): Promise<string | null> {
  const quote = await db.query.quotes.findFirst({ where: eq(quotes.id, quoteId) });
  const existing = await db.query.orders.findFirst({ where: eq(orders.quoteId, quoteId) });
  if (!quote || existing) return null;

  const orderNumber = await nextSalesOrderNumber();
  const publicToken = randomBytes(16).toString("hex");
  // Credit the account owner as the sales rep, and fix the order value from the
  // quote total, so the standard sales/open-order reports have data.
  const bp = quote.bpId
    ? await db.query.businessPartners.findFirst({ where: eq(businessPartners.id, quote.bpId), columns: { ownerId: true } })
    : null;
  const repId = bp?.ownerId ?? byUserId;
  const [o] = await db
    .insert(orders)
    .values({
      orderNumber,
      bpId: quote.bpId,
      quoteId,
      publicToken,
      stage: "received",
      createdBy: byUserId,
      amount: quote.total ?? "0",
      salesRepId: repId,
      isReorder: quote.isReorder ?? false,
    })
    .returning({ id: orders.id });
  await db.insert(orderEvents).values({ orderId: o.id, stage: "received", byUserId });

  const qLines = await db.select().from(quoteLines).where(eq(quoteLines.quoteId, quoteId));

  // Turn each garment line's decorations into order spec items so the art &
  // production teams get the placements, methods, colors, and size breakdown.
  const garmentQLines = qLines.filter((l) => l.styleId || (Array.isArray(l.decorations) && (l.decorations as unknown[]).length > 0) || (l.sizeBreakdown != null && Object.keys(l.sizeBreakdown as object).length > 0));
  // Aggregate the per-garment extras chosen on the quote into the order's
  // structured fulfillment flags + notes, so the shop floor and PDF see them.
  let needsBarcode = false, needsHangtag = false, needsFolding = false;
  const extraLabelSet = new Set<string>();
  if (garmentQLines.length) {
    const [locRows, methRows, extraRows] = await Promise.all([
      db.select().from(printLocations),
      db.select().from(decorationMethods),
      db.select().from(pricingExtras),
    ]);
    const locName = new Map(locRows.map((l) => [l.code, l.name]));
    const methName = new Map(methRows.map((mm) => [mm.code, mm.name]));
    const extraById = new Map(extraRows.map((e) => [e.id, e.label]));
    const specRows: (typeof orderSpecItems.$inferInsert)[] = [];
    let sort = 0;
    for (const l of garmentQLines) {
      const decos = (l.decorations as DecorationInput[] | null) ?? [];
      const sb = (l.sizeBreakdown as Record<string, number> | null) ?? {};
      const sizeStr = Object.entries(sb).filter(([, q]) => Number(q) > 0).map(([s, q]) => `${s}:${q}`).join(" ");
      // Resolve this line's extras → labels + fulfillment flags.
      const lineExtraLabels = ((l.extras as string[] | null) ?? []).map((id) => extraById.get(id)).filter((x): x is string => !!x);
      for (const label of lineExtraLabels) {
        extraLabelSet.add(label);
        const low = label.toLowerCase();
        if (low.includes("barcode")) needsBarcode = true;
        if (low.includes("fold")) needsFolding = true;
        if (low.includes("hangtag") || low.includes("hang tag") || low.includes("tear out label")) needsHangtag = true;
      }
      const extrasNote = lineExtraLabels.length ? `Extras: ${lineExtraLabels.join(", ")}` : null;
      if (decos.length === 0) {
        specRows.push({ orderId: o.id, product: l.description, sizeBreakdown: sizeStr || null, notes: extrasNote, sortOrder: sort++ });
      } else {
        decos.forEach((d, di) => {
          const level = !d.stitchTier && d.level ? `Level ${d.level}` : null;
          specRows.push({
            orderId: o.id,
            product: l.description,
            decorationMethod: methName.get(d.method) ?? d.method,
            placement: locName.get(d.location) ?? d.location,
            colorCount: d.stitchTier ? null : d.colorCount ?? null,
            colors: d.stitchTier ? `${d.stitchTier} stitch` : level,
            sizeBreakdown: sizeStr || null,
            // Put the extras note once per line (on its first decoration row).
            notes: di === 0 ? extrasNote : null,
            sortOrder: sort++,
          });
        });
      }
    }
    if (specRows.length) await db.insert(orderSpecItems).values(specRows);
  }
  // Persist the aggregated fulfillment flags on the order.
  if (needsBarcode || needsHangtag || needsFolding || extraLabelSet.size) {
    await db.update(orders).set({
      needsBarcode, needsHangtag, needsFolding,
      fulfillmentNotes: extraLabelSet.size ? Array.from(extraLabelSet).join(", ") : null,
    }).where(eq(orders.id, o.id));
  }

  // Carry catalogue images of the quoted items onto the order for the art dept.
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
          uploadedBy: byUserId,
        })),
      );
    }
  }

  // Carry the customer's intake files (art/reference) onto the order.
  const qAtt = await db.select().from(quoteAttachments).where(eq(quoteAttachments.quoteId, quoteId));
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
    await db.insert(activities).values({ bpId: quote.bpId, userId: byUserId, type: "other", isSystem: true, content: `Order ${orderNumber} created from quote ${quote.quoteNumber}` });
    // Placing an order makes them a customer — advance the pipeline (forward-only).
    await advanceLifecycle(quote.bpId, "customer", `placed order ${orderNumber}`, byUserId ?? undefined);
  }
  await audit({ userId: byUserId, action: "order.create", entityType: "order", entityId: o.id, metadata: { orderNumber } });
  return o.id;
}
