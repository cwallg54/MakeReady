"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { artRequests, orders, orderSpecItems, businessPartners, activities, historicalOrders, invoices } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView, canEdit } from "@/lib/rbac";
import { canDoArt } from "@/lib/art/access";
import { audit } from "@/lib/audit";
import { aiComplete } from "./client";

export interface AiState {
  text?: string;
  error?: string;
}

// ---- Art brief from the order details -------------------------------------

/** Draft a clean art brief from the order's production spec + notes, and save
 *  it into the art request's brief field (art can edit it after). */
export async function generateArtBriefAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !canDoArt(user.roles)) redirect("/403");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const req = await db.query.artRequests.findFirst({ where: eq(artRequests.id, id) });
  if (!req) return;
  const [order, specs] = await Promise.all([
    db.query.orders.findFirst({ where: eq(orders.id, req.orderId), columns: { orderNumber: true, productionNotes: true } }),
    db.select().from(orderSpecItems).where(eq(orderSpecItems.orderId, req.orderId)),
  ]);

  const details = {
    orderNumber: order?.orderNumber,
    currentBrief: req.brief,
    specialInstructions: order?.productionNotes,
    items: specs.map((s) => ({ product: s.product, decoration: s.decorationMethod, placement: s.placement, colors: s.colors, colorCount: s.colorCount, sizes: s.sizeBreakdown, notes: s.notes })),
  };

  const res = await aiComplete({
    system: "You are an art production coordinator at a commercial decoration shop (screen print, embroidery, headwear, promo). Turn the order details into a clear, tight art brief for the artist. Use short labeled lines (What / Decoration / Placement / Colors / Sizes / Special instructions). Only use the details provided — never invent artwork, colors, or sizes. If something isn't specified, write \"not specified\". Keep it under ~120 words.",
    prompt: `Write the art brief from these order details:\n\n${JSON.stringify(details, null, 2)}`,
    maxTokens: 500,
  });
  if (!res.ok) redirect(`/art/${id}?err=${encodeURIComponent(res.error ?? "AI failed")}`);
  await db.update(artRequests).set({ brief: res.text, updatedAt: new Date() }).where(eq(artRequests.id, id));
  await audit({ userId: user.id, action: "ai.art_brief", entityType: "art_request", entityId: id });
  revalidatePath(`/art/${id}`);
}

// ---- Customer summary (CRM) -----------------------------------------------

/** Summarize a customer's profile, history, and credit in plain English. */
export async function summarizeCustomerAction(_prev: AiState, formData: FormData): Promise<AiState> {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "crm")) return { error: "Not allowed." };
  const bpId = String(formData.get("bpId") ?? "");
  if (!bpId) return { error: "No customer." };
  const bp = await db.query.businessPartners.findFirst({ where: eq(businessPartners.id, bpId) });
  if (!bp) return { error: "Customer not found." };

  const finance = canView(user.roles, "accounting") || canEdit(user.roles, "crm");
  const [hist, recentActs, openInv] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int`, total: sql<string>`COALESCE(SUM(${historicalOrders.docTotal}),0)`, last: sql<string>`MAX(${historicalOrders.docDate})` }).from(historicalOrders).where(and(eq(historicalOrders.bpId, bpId), eq(historicalOrders.canceled, false))),
    db.select({ content: activities.content, type: activities.type }).from(activities).where(eq(activities.bpId, bpId)).orderBy(desc(activities.createdAt)).limit(12),
    db.select({ n: sql<number>`count(*)::int` }).from(invoices).where(and(eq(invoices.bpId, bpId), sql`${invoices.status} <> 'paid'`, sql`${invoices.voidedAt} is null`)),
  ]);

  const profile = {
    company: bp.companyName,
    stage: bp.lifecycleStage,
    tags: bp.tags,
    leadSource: bp.leadSource,
    city: bp.addressCity, state: bp.addressState,
    lifetimeOrders: hist[0]?.n ?? 0,
    lifetimeRevenue: Math.round(Number(hist[0]?.total ?? 0)),
    lastOrderDate: hist[0]?.last ?? null,
    openInvoices: openInv[0]?.n ?? 0,
    ...(finance ? { paymentTerms: bp.paymentTerms, creditLimit: bp.creditLimit ? Number(bp.creditLimit) : null, accountBalance: bp.accountBalance ? Number(bp.accountBalance) : null, creditHold: bp.creditHold, creditHoldReason: bp.creditHoldReason } : {}),
    recentActivity: recentActs.map((a) => a.content).slice(0, 12),
  };

  const res = await aiComplete({
    system: "You brief a salesperson before they contact a customer. In 3–5 short sentences, summarize who this account is, their buying history and value, any credit/collection flags, and what's happening recently. Be factual and concise — only use the data provided. If a credit hold or overdue balance exists, lead with it. Do not invent anything.",
    prompt: `Summarize this account:\n\n${JSON.stringify(profile, null, 2)}`,
    maxTokens: 400,
  });
  if (!res.ok) return { error: res.error };
  await audit({ userId: user.id, action: "ai.customer_summary", entityType: "business_partner", entityId: bpId });
  return { text: res.text };
}
