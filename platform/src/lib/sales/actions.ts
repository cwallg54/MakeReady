"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { quotes, quoteLines, quoteCharges, quoteAttachments, orderFormTemplates, templateItems, numberSeries, activities, orders, orderEvents, orderAttachments, orderSpecItems, businessPartners, catalogStyles, sizeClasses, decorationMethods, printLocations, embroideryTiers } from "@/db/schema";
import { randomBytes } from "crypto";
import { getCurrentUser } from "@/lib/auth/service";
import { canEdit, canView } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { priceQuote, resolveUnitPrice, sizeUpcharge, priceGarmentLine, type ChargeRule, type PriceBreak, type GarmentLineData, type DecorationInput, type MethodRef, type EmbTierRef, type SizeEntry } from "./pricing";

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
  garmentLines?: GarmentLineData[];
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

  // Server recomputes all money — never trust client-computed totals. Discount
  // is applied once at the end across simple + garment lines, so priceQuote runs
  // with discount 0 and we only take its per-line/charge figures.
  const priced = priceQuote({
    lines: resolvedLines,
    rules,
    applied: payload.applied,
    isReorder: payload.isReorder,
    discount: 0,
  });

  // Preserve each priced line's chosen size for persistence (priceQuote drops unknown fields).
  const sizeByIndex = resolvedLines.map((l) => l.size ?? null);

  // Garment lines (full quoting calculator): priced server-side from the catalog
  // style base, size class, color tier, and decorations. Setup charges each
  // decoration generates are persisted as quote_charges.
  const garmentInputs = (payload.garmentLines ?? []).filter((g) =>
    Object.values(g.sizeBreakdown ?? {}).some((q) => Number(q) > 0),
  );
  const garmentRows: (typeof quoteLines.$inferInsert)[] = [];
  const garmentCharges: (typeof quoteCharges.$inferInsert)[] = [];
  let garmentSubtotal = 0;
  let garmentChargeTotal = 0;
  if (garmentInputs.length) {
    const styleIds = [...new Set(garmentInputs.map((g) => g.styleId).filter((x): x is string => !!x))];
    const styles = styleIds.length ? await db.select().from(catalogStyles).where(inArray(catalogStyles.id, styleIds)) : [];
    const styleById = new Map(styles.map((s) => [s.id, s]));
    const classCodes = [...new Set(styles.map((s) => s.sizeClassCode).filter((x): x is string => !!x))];
    const classes = classCodes.length ? await db.select().from(sizeClasses).where(inArray(sizeClasses.code, classCodes)) : [];
    const classByCode = new Map(classes.map((c) => [c.code, (c.sizes as SizeEntry[] | null) ?? []]));
    const methodRows = await db.select().from(decorationMethods);
    const methods = new Map<string, MethodRef>(methodRows.map((mm) => [mm.code, { code: mm.code, name: mm.name, priceMode: mm.priceMode, pricing: (mm.pricing as MethodRef["pricing"]) ?? null }]));
    const embRows = await db.select().from(embroideryTiers);
    const embTiers = new Map<string, EmbTierRef>(embRows.map((e) => [e.code, { code: e.code, pricePerUnit: Number(e.pricePerUnit) }]));

    garmentInputs.forEach((g, gi) => {
      const style = g.styleId ? styleById.get(g.styleId) : undefined;
      const sizes = style?.sizeClassCode ? classByCode.get(style.sizeClassCode) ?? null : null;
      const res = priceGarmentLine({
        basePrice: style ? Number(style.basePrice) : 0,
        sizeClassSizes: sizes,
        sizeBreakdown: g.sizeBreakdown ?? {},
        colorTier: g.colorTier ?? undefined,
        decorations: g.decorations ?? [],
        methods,
        embTiers,
        isReorder: payload.isReorder,
      });
      garmentSubtotal += res.extended;
      const baseDesc = style?.name || g.description || "(garment)";
      garmentRows.push({
        quoteId,
        styleId: g.styleId ?? null,
        description: g.color ? `${baseDesc} — ${g.color}` : baseDesc,
        color: g.color ?? null,
        colorTier: g.colorTier ?? null,
        sizeBreakdown: g.sizeBreakdown ?? {},
        decorations: g.decorations ?? [],
        qty: res.totalUnits,
        unitPrice: String(res.blendedUnitPrice),
        extended: String(res.extended),
        sortOrder: priced.lines.length + gi,
      });
      res.setups.forEach((s, si) => {
        garmentChargeTotal += s.amount;
        garmentCharges.push({ quoteId, key: `deco-${gi}-${si}`, label: s.label, type: "flat", rate: String(s.amount), inputQty: "1", amount: String(s.amount) });
      });
    });
  }

  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const subtotal = round2(priced.subtotal + garmentSubtotal);
  const chargesTotal = round2(priced.chargesTotal + garmentChargeTotal);
  const discount = round2(payload.discount || 0);
  const total = round2(subtotal + chargesTotal - discount);

  await db.transaction(async (tx) => {
    await tx.delete(quoteLines).where(eq(quoteLines.quoteId, quoteId));
    await tx.delete(quoteCharges).where(eq(quoteCharges.quoteId, quoteId));
    const lineRows = [
      ...priced.lines.map((l, i) => ({
        quoteId,
        itemCode: l.itemCode || null,
        description: l.description || "(item)",
        size: sizeByIndex[i],
        qty: l.qty || 0,
        unitPrice: String(l.unitPrice || 0),
        extended: String(l.extended),
        sortOrder: i,
      })),
      ...garmentRows,
    ];
    if (lineRows.length) await tx.insert(quoteLines).values(lineRows);
    const chargeRows = [
      ...priced.charges.map((c) => ({
        quoteId,
        key: c.key,
        label: c.label,
        type: c.type,
        rate: String(c.rate),
        inputQty: String(c.inputQty),
        amount: String(c.amount),
      })),
      ...garmentCharges,
    ];
    if (chargeRows.length) await tx.insert(quoteCharges).values(chargeRows);
    await tx
      .update(quotes)
      .set({
        isReorder: payload.isReorder,
        discount: String(discount),
        subtotal: String(subtotal),
        chargesTotal: String(chargesTotal),
        total: String(total),
        notes: payload.notes || null,
        updatedAt: new Date(),
      })
      .where(eq(quotes.id, quoteId));
    await audit({ userId: user.id, action: "quote.update", entityType: "quote", entityId: quoteId, metadata: { total } }, tx);
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

  // Credit enforcement: block converting to an order when the customer is on
  // credit hold or the order would push them over their credit limit. Checked
  // before the status change so the quote isn't left "converted" with no order.
  if (status === "converted") {
    const q = await db.query.quotes.findFirst({ where: eq(quotes.id, id), columns: { bpId: true, total: true } });
    const bp = q?.bpId ? await db.query.businessPartners.findFirst({ where: eq(businessPartners.id, q.bpId), columns: { creditHold: true, creditLimit: true, accountBalance: true } }) : null;
    if (bp?.creditHold) redirect(`/sales/quotes/${id}?holderr=hold`);
    if (bp?.creditLimit != null && Number(bp.creditLimit) > 0 && Number(bp.accountBalance ?? 0) + Number(q?.total ?? 0) > Number(bp.creditLimit)) {
      redirect(`/sales/quotes/${id}?holderr=limit`);
    }
  }

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

      // Turn each garment line's decorations into order spec items so the art &
      // production teams get the placements, methods, colors, and size breakdown.
      const garmentQLines = qLines.filter((l) => l.styleId || (Array.isArray(l.decorations) && (l.decorations as unknown[]).length > 0) || (l.sizeBreakdown != null && Object.keys(l.sizeBreakdown as object).length > 0));
      if (garmentQLines.length) {
        const [locRows, methRows] = await Promise.all([db.select().from(printLocations), db.select().from(decorationMethods)]);
        const locName = new Map(locRows.map((l) => [l.code, l.name]));
        const methName = new Map(methRows.map((mm) => [mm.code, mm.name]));
        const specRows: (typeof orderSpecItems.$inferInsert)[] = [];
        let sort = 0;
        for (const l of garmentQLines) {
          const decos = (l.decorations as DecorationInput[] | null) ?? [];
          const sb = (l.sizeBreakdown as Record<string, number> | null) ?? {};
          const sizeStr = Object.entries(sb).filter(([, q]) => Number(q) > 0).map(([s, q]) => `${s}:${q}`).join(" ");
          if (decos.length === 0) {
            specRows.push({ orderId: o.id, product: l.description, sizeBreakdown: sizeStr || null, sortOrder: sort++ });
          } else {
            for (const d of decos) {
              specRows.push({
                orderId: o.id,
                product: l.description,
                decorationMethod: methName.get(d.method) ?? d.method,
                placement: locName.get(d.location) ?? d.location,
                colorCount: d.stitchTier ? null : d.colorCount ?? null,
                colors: d.stitchTier ? `${d.stitchTier} stitch` : null,
                sizeBreakdown: sizeStr || null,
                sortOrder: sort++,
              });
            }
          }
        }
        if (specRows.length) await db.insert(orderSpecItems).values(specRows);
      }

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
