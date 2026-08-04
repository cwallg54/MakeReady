"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@/db";
import { quotes, businessPartners, contacts, activities, notifications } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView, canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { sendQuoteEmail } from "@/lib/email";
import { createOrderFromQuote } from "./order-from-quote";
import { assessCredit, openCreditRequest } from "./credit";

const BASE = () => process.env.APP_URL ?? "https://makeready.g54.com";

async function requireSalesEdit() {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "sales") || !canEdit(user.roles, "sales")) redirect("/403");
  return user;
}

async function recipientFor(bpId: string | null): Promise<string> {
  if (!bpId) return "";
  const [bp, contact] = await Promise.all([
    db.query.businessPartners.findFirst({ where: eq(businessPartners.id, bpId), columns: { email: true } }),
    db.query.contacts.findFirst({ where: and(eq(contacts.bpId, bpId), eq(contacts.isPrimary, true)), columns: { email: true } }),
  ]);
  return contact?.email ?? bp?.email ?? "";
}

/** Staff: email the quote to the customer with an approve/decline link (Resend). */
export async function emailQuoteToCustomerAction(formData: FormData): Promise<void> {
  const user = await requireSalesEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const quote = await db.query.quotes.findFirst({ where: eq(quotes.id, id) });
  if (!quote) return;

  // Mint the public token on first send.
  let token = quote.publicToken;
  if (!token) {
    token = randomBytes(24).toString("hex");
    await db.update(quotes).set({ publicToken: token }).where(eq(quotes.id, id));
  }
  // Sending advances a draft to "sent".
  if (quote.status === "draft") await db.update(quotes).set({ status: "sent", updatedAt: new Date() }).where(eq(quotes.id, id));

  const to = await recipientFor(quote.bpId);
  if (to) await sendQuoteEmail(to, quote.quoteNumber, `$${Number(quote.total).toFixed(2)}`, `${BASE()}/quote/${token}`);

  if (quote.bpId) {
    await db.insert(activities).values({ bpId: quote.bpId, userId: user.id, type: "email", isSystem: true, content: `Quote ${quote.quoteNumber} emailed to ${to || "customer (no email on file)"} for approval` });
    revalidatePath(`/crm/${quote.bpId}`);
  }
  await audit({ userId: user.id, action: "quote.email", entityType: "quote", entityId: id, metadata: { to } });
  revalidatePath(`/sales/quotes/${id}`);
}

export interface QuoteDecisionState {
  error?: string;
  done?: boolean;
}

/** Public: the customer's Approve / Decline decision on a quote. */
export async function submitQuoteDecisionAction(_prev: QuoteDecisionState, formData: FormData): Promise<QuoteDecisionState> {
  const token = String(formData.get("token") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const signedName = String(formData.get("signedName") ?? "").trim();
  const note = String(formData.get("notes") ?? "").trim();
  if (!token || (decision !== "approve" && decision !== "decline")) return { error: "Please choose an option." };
  if (!signedName) return { error: "Please type your name to sign." };
  if (decision === "decline" && !note) return { error: "Please tell us why you're declining." };

  const quote = await db.query.quotes.findFirst({ where: eq(quotes.publicToken, token) });
  if (!quote) return { error: "This approval link is not valid." };
  if (quote.respondedAt || quote.status === "converted") return { done: true }; // already handled

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const approve = decision === "approve";

  // On approval, auto-convert to an order — unless the customer is on credit
  // hold or the order would exceed their limit, in which case it's marked
  // accepted and flagged for finance instead.
  let converted = false;
  let creditBlocked = false;
  if (approve) {
    const bp = quote.bpId ? await db.query.businessPartners.findFirst({ where: eq(businessPartners.id, quote.bpId), columns: { creditHold: true, creditLimit: true, accountBalance: true } }) : null;
    const assessment = bp ? assessCredit(bp, Number(quote.total)) : null;
    creditBlocked = !!assessment?.blocked;
    if (creditBlocked && assessment) {
      // Customer approved, but it needs finance sign-off — open a request.
      await openCreditRequest({ quoteId: quote.id, bpId: quote.bpId, orderTotal: Number(quote.total), assessment, requestedBy: quote.createdBy });
    } else {
      await createOrderFromQuote(quote.id, quote.createdBy);
      converted = true;
    }
  }

  await db.update(quotes).set({
    status: approve ? (converted ? "converted" : "accepted") : "rejected",
    respondedAt: new Date(),
    signedName,
    responseNote: note || null,
    responseIp: ip,
    updatedAt: new Date(),
  }).where(eq(quotes.id, quote.id));

  const verb = approve ? "approved" : "declined";
  if (quote.createdBy) {
    await db.insert(notifications).values({
      userId: quote.createdBy,
      type: "quote",
      title: `Quote ${verb}`,
      body: `${signedName} ${verb} quote ${quote.quoteNumber}${approve ? (converted ? " — order created" : " — needs credit review before converting") : ""}.${note ? ` “${note}”` : ""}`,
      link: `/sales/quotes/${quote.id}`,
    });
  }
  if (quote.bpId) {
    await db.insert(activities).values({
      bpId: quote.bpId,
      type: approve ? "other" : "note",
      isSystem: true,
      content: `Customer ${verb} quote ${quote.quoteNumber} (signed: ${signedName})${note ? ` — ${note}` : ""}${creditBlocked ? " [credit hold — order not auto-created]" : ""}`,
    });
    revalidatePath(`/crm/${quote.bpId}`);
  }
  await audit({ userId: null, action: "quote.decision", entityType: "quote", entityId: quote.id, metadata: { decision, signedName, converted } });
  revalidatePath(`/quote/${token}`);
  revalidatePath(`/sales/quotes/${quote.id}`);
  return { done: true };
}
