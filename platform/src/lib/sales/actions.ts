"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { quotes, quoteLines, quoteCharges, orderFormTemplates, templateItems, numberSeries, activities, businessPartners, catalogStyles, sizeClasses, decorationMethods, embroideryTiers, pricingMethods, pricingGarments, pricingExtras } from "@/db/schema";
import type { SilkscreenConfig, EmbroideryConfig, AsiConfig } from "@/lib/pricing/engine";
import { getCurrentUser } from "@/lib/auth/service";
import { canEdit, canView } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { priceQuote, resolveUnitPrice, sizeUpcharge, priceGarmentLine, type ChargeRule, type PriceBreak, type GarmentLineData, type MethodRef, type EmbTierRef, type SizeEntry } from "./pricing";
import { createOrderFromQuote } from "./order-from-quote";
import { assessCredit, openCreditRequest } from "./credit";

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
  isAsi?: boolean;
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

    // Softgoods engine config + per-style garment cost (must match the client preview).
    const [ssMethod, embMethod] = await Promise.all([
      db.query.pricingMethods.findFirst({ where: eq(pricingMethods.key, "silkscreen") }),
      db.query.pricingMethods.findFirst({ where: eq(pricingMethods.key, "embroidery") }),
    ]);
    const asiMethod = await db.query.pricingMethods.findFirst({ where: eq(pricingMethods.key, "asi") });
    const engine = (ssMethod || embMethod || asiMethod)
      ? { silkscreen: ssMethod?.config as SilkscreenConfig | undefined, embroidery: embMethod?.config as EmbroideryConfig | undefined, asi: asiMethod?.config as AsiConfig | undefined }
      : undefined;
    const styleNums = styles.map((s) => s.styleNumber).filter((x): x is string => !!x);
    const pgRows = styleNums.length ? await db.select({ garmentNumber: pricingGarments.garmentNumber, cost: pricingGarments.cost }).from(pricingGarments).where(inArray(pricingGarments.garmentNumber, styleNums)) : [];
    const costByNum = new Map(pgRows.map((r) => [r.garmentNumber, Number(r.cost)]));
    const garmentCostOf = (s: typeof styles[number] | undefined) =>
      s ? (s.supplierCost != null ? Number(s.supplierCost) : s.styleNumber ? costByNum.get(s.styleNumber) : undefined) : undefined;

    // Per-garment extras (barcode, folding…) — amounts from pricing_extras.
    const extraRows = await db.select({ id: pricingExtras.id, amount: pricingExtras.amount }).from(pricingExtras);
    const extraAmt = new Map(extraRows.map((e) => [e.id, e.amount == null ? 0 : Number(e.amount)]));
    const extrasPerUnitOf = (ids: string[] | undefined) => (ids ?? []).reduce((s, id) => s + (extraAmt.get(id) ?? 0), 0);

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
        engine,
        garmentCost: garmentCostOf(style),
        extrasPerUnit: extrasPerUnitOf(g.extras),
        asiChannel: !!payload.isAsi,
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
        extras: g.extras ?? [],
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
  // Pricing discretion: Managers/Admins discount freely; a Sales Rep may apply a
  // small "price adjustment" up to the configured cap (% of subtotal) — it comes
  // out of their commission. Enforced server-side; never trust the client figure.
  const canDiscount = user.roles.some((r) => r === "admin" || r === "sales_manager");
  const requested = round2(payload.discount || 0);
  let discount: number;
  if (canDiscount) {
    discount = requested;
  } else {
    const capPct = Number((await db.query.systemSettings.findFirst({ columns: { repDiscountCapPct: true } }))?.repDiscountCapPct ?? 0);
    const capAmount = round2(subtotal * (capPct / 100));
    discount = Math.min(Math.max(0, requested), capAmount);
  }
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
        isAsi: !!payload.isAsi,
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

  // Credit enforcement: a blocked (on-hold or over-limit) conversion doesn't
  // dead-end — it opens a finance credit-approval request. Checked before the
  // status change so the quote isn't left "converted" with no order.
  if (status === "converted") {
    const q = await db.query.quotes.findFirst({ where: eq(quotes.id, id), columns: { bpId: true, total: true } });
    const bp = q?.bpId ? await db.query.businessPartners.findFirst({ where: eq(businessPartners.id, q.bpId), columns: { creditHold: true, creditLimit: true, accountBalance: true } }) : null;
    if (bp) {
      const assessment = assessCredit(bp, Number(q?.total ?? 0));
      if (assessment.blocked) {
        await openCreditRequest({ quoteId: id, bpId: q?.bpId ?? null, orderTotal: Number(q?.total ?? 0), assessment, requestedBy: user.id });
        redirect(`/sales/quotes/${id}?review=1`);
      }
    }
  }

  await db
    .update(quotes)
    .set({ status: status as "draft" | "sent" | "accepted" | "rejected" | "converted", updatedAt: new Date() })
    .where(eq(quotes.id, id));
  await audit({ userId: user.id, action: "quote.status", entityType: "quote", entityId: id, metadata: { status } });

  // Converting a quote spawns a trackable order (once).
  if (status === "converted") {
    await createOrderFromQuote(id, user.id);
    const q = await db.query.quotes.findFirst({ where: eq(quotes.id, id), columns: { bpId: true } });
    if (q?.bpId) revalidatePath(`/crm/${q.bpId}`);
  }

  revalidatePath(`/sales/quotes/${id}`);
  revalidatePath("/sales");
}
