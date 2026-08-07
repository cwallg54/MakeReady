import { ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { businessPartners, contacts, activities, designItems, quotes, orders, invoices, vendors, bills, inventoryItems, type Role } from "@/db/schema";
import { canView } from "@/lib/rbac";
import { canDoArt } from "@/lib/art/access";
import { aiComplete, aiConfigured } from "@/lib/ai/client";

export interface SearchHit {
  type: string;
  label: string;
  sublabel?: string;
  href: string;
}
export interface SearchGroup {
  key: string;
  label: string;
  hits: SearchHit[];
}

const PER = 6;
const ORDER = ["bp", "contact", "order", "quote", "invoice", "bill", "vendor", "inventory", "design", "activity"];

/**
 * Cross-entity keyword search, gated to what the caller's roles can view. Runs
 * ILIKE across the key text columns of each entity. This is the retrieval half
 * of the AI search — a compact, ranked candidate set the model then explains.
 */
export async function runSiteSearch(qRaw: string, roles: Role[]): Promise<SearchGroup[]> {
  const q = (qRaw ?? "").trim().slice(0, 100);
  if (q.length < 2) return [];
  const like = `%${q}%`;

  const crm = canView(roles, "crm");
  const sales = canView(roles, "sales");
  const acct = canView(roles, "accounting");
  const inv = canView(roles, "inventory");
  const design = canDoArt(roles) || canView(roles, "content_library");

  const groups: SearchGroup[] = [];
  const tasks: Promise<void>[] = [];
  const add = (key: string, label: string, hits: SearchHit[]) => { if (hits.length) groups.push({ key, label, hits }); };

  if (crm) {
    tasks.push((async () => {
      const rows = await db.select({ id: businessPartners.id, companyName: businessPartners.companyName, bpNumber: businessPartners.bpNumber })
        .from(businessPartners)
        .where(or(ilike(businessPartners.companyName, like), ilike(businessPartners.bpNumber, like), ilike(businessPartners.email, like), ilike(businessPartners.phone, like)))
        .limit(PER);
      add("bp", "Business Partners", rows.map((r) => ({ type: "Business Partner", label: r.companyName, sublabel: r.bpNumber, href: `/crm/${r.id}` })));
    })());
    tasks.push((async () => {
      const rows = await db.select({ bpId: contacts.bpId, firstName: contacts.firstName, lastName: contacts.lastName, title: contacts.title })
        .from(contacts)
        .where(or(ilike(contacts.firstName, like), ilike(contacts.lastName, like), ilike(contacts.email, like), ilike(contacts.phone, like)))
        .limit(PER);
      add("contact", "Contacts", rows.filter((r) => r.bpId).map((r) => ({ type: "Contact", label: [r.firstName, r.lastName].filter(Boolean).join(" ") || "Contact", sublabel: r.title ?? undefined, href: `/crm/${r.bpId}` })));
    })());
    tasks.push((async () => {
      const rows = await db.select({ bpId: activities.bpId, content: activities.content })
        .from(activities).where(ilike(activities.content, like)).limit(PER);
      add("activity", "Activity notes", rows.filter((r) => r.bpId).map((r) => ({ type: "Activity", label: r.content.slice(0, 80), href: `/crm/${r.bpId}` })));
    })());
  }
  if (sales) {
    tasks.push((async () => {
      const rows = await db.select({ id: orders.id, orderNumber: orders.orderNumber, poNumber: orders.poNumber })
        .from(orders)
        .where(or(ilike(orders.orderNumber, like), ilike(orders.poNumber, like), ilike(orders.notes, like)))
        .limit(PER);
      add("order", "Orders", rows.map((r) => ({ type: "Order", label: r.orderNumber, sublabel: r.poNumber ? `PO ${r.poNumber}` : undefined, href: `/sales/orders/${r.id}` })));
    })());
    tasks.push((async () => {
      const rows = await db.select({ id: quotes.id, quoteNumber: quotes.quoteNumber })
        .from(quotes).where(ilike(quotes.quoteNumber, like)).limit(PER);
      add("quote", "Quotes", rows.map((r) => ({ type: "Quote", label: r.quoteNumber, href: `/sales/quotes/${r.id}` })));
    })());
  }
  if (acct) {
    tasks.push((async () => {
      const rows = await db.select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber })
        .from(invoices).where(or(ilike(invoices.invoiceNumber, like), ilike(invoices.notes, like))).limit(PER);
      add("invoice", "Invoices", rows.map((r) => ({ type: "Invoice", label: r.invoiceNumber, href: `/accounting/invoices/${r.id}` })));
    })());
    tasks.push((async () => {
      const rows = await db.select({ id: bills.id, billNumber: bills.billNumber, vendorRef: bills.vendorRef })
        .from(bills).where(or(ilike(bills.billNumber, like), ilike(bills.vendorRef, like), ilike(bills.notes, like))).limit(PER);
      add("bill", "Bills", rows.map((r) => ({ type: "Bill", label: r.billNumber, sublabel: r.vendorRef ?? undefined, href: `/accounting/bills/${r.id}` })));
    })());
    tasks.push((async () => {
      const rows = await db.select({ name: vendors.name })
        .from(vendors).where(or(ilike(vendors.name, like), ilike(vendors.email, like), ilike(vendors.phone, like))).limit(PER);
      add("vendor", "Vendors", rows.map((r) => ({ type: "Vendor", label: r.name, href: `/accounting/vendors` })));
    })());
  }
  if (inv) {
    tasks.push((async () => {
      const rows = await db.select({ id: inventoryItems.id, name: inventoryItems.name, sku: inventoryItems.sku })
        .from(inventoryItems).where(or(ilike(inventoryItems.name, like), ilike(inventoryItems.sku, like), ilike(inventoryItems.category, like))).limit(PER);
      add("inventory", "Inventory items", rows.map((r) => ({ type: "Item", label: r.name, sublabel: r.sku, href: `/inventory/${r.id}` })));
    })());
  }
  if (design) {
    tasks.push((async () => {
      const rows = await db.select({ id: designItems.id, itemNumber: designItems.itemNumber, description: designItems.description })
        .from(designItems)
        .where(or(ilike(designItems.itemNumber, like), ilike(designItems.description, like), ilike(designItems.custNumber, like), ilike(designItems.designBase, like), ilike(designItems.barcodeNumber, like)))
        .limit(PER);
      add("design", "Designs", rows.map((r) => ({ type: "Design", label: r.itemNumber, sublabel: r.description ?? undefined, href: `/designs/${r.id}` })));
    })());
  }

  await Promise.all(tasks);
  groups.sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
  return groups;
}

/** The AI half: interpret the query against the retrieved hits and answer in
 *  plain English, pointing at the best matches. Returns null if AI is off or fails. */
export async function aiSearchAnswer(query: string, groups: SearchGroup[]): Promise<string | null> {
  if (!aiConfigured()) return null;
  const flat = groups.flatMap((g) => g.hits.map((h) => `${h.type}: ${h.label}${h.sublabel ? ` (${h.sublabel})` : ""}`)).slice(0, 40);
  const res = await aiComplete({
    system: "You are the search assistant for an ERP used by a commercial print & decoration company (business partners, orders, quotes, invoices, bills, vendors, inventory, designs). Given a user's query and a list of matching records, answer in 1–3 short sentences: what the results show and which look most relevant. If the list is empty, say nothing matched and suggest how to refine (e.g., try an order number, company name, or item #). Never invent records not in the list.",
    prompt: `Query: "${query}"\n\nMatching records:\n${flat.length ? flat.join("\n") : "(none)"}`,
    maxTokens: 220,
    temperature: 0.3,
  });
  return res.ok ? res.text ?? null : null;
}
