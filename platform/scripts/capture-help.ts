/**
 * Seeds temporary demo data, mints an authenticated session, captures
 * screenshots of every feature into public/help/*.png, then removes the demo
 * data. Run:  pnpm exec tsx scripts/capture-help.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { eq, asc } from "drizzle-orm";
import { SignJWT } from "jose";
import { randomUUID, randomBytes } from "crypto";
import { chromium } from "playwright";
import { db } from "../src/db";
import {
  users, sessions, businessPartners, contacts, accountGroups, activities,
  quotes, quoteLines, quoteCharges, orders, orderEvents, customerDocuments,
  meetings, meetingTypes, orderFormTemplates, automationCampaigns, systemSettings,
} from "../src/db/schema";

const BASE = "https://makeready.g54.com";
const OUT = "public/help";
const tok = () => randomBytes(24).toString("hex");
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);

async function main() {
  const admin = await db.query.users.findFirst({ where: eq(users.email, "cwall@g54.com") });
  if (!admin) throw new Error("admin user cwall@g54.com not found");
  const group = await db.query.accountGroups.findFirst();
  const template = await db.query.orderFormTemplates.findFirst({ orderBy: asc(orderFormTemplates.name) });
  const campaign = await db.query.automationCampaigns.findFirst();
  const mtype = await db.query.meetingTypes.findFirst({ orderBy: asc(meetingTypes.sortOrder) });

  // If the org requires MFA, temporarily relax it so the app doesn't redirect
  // every page to the security screen during capture. Restored at the end.
  const settings = await db.query.systemSettings.findFirst();
  const relaxMfa = !!settings?.requireMfa;
  if (relaxMfa) await db.update(systemSettings).set({ requireMfa: false });

  // ---- Seed demo data ------------------------------------------------------
  const [bp] = await db.insert(businessPartners).values({
    bpNumber: "BP-DEMO01", companyName: "Acme Demo Co", lifecycleStage: "prospect",
    leadSource: "Referral", ownerId: admin.id, accountGroupId: group?.id ?? null,
    tags: ["VIP", "screen-print"], email: "buyer@acmedemo.example", phone: "801-555-0100",
    addressStreet: "123 Market St", addressCity: "Salt Lake City", addressState: "UT", addressZip: "84101",
    createdBy: admin.id,
  }).returning({ id: businessPartners.id });

  await db.insert(contacts).values({
    bpId: bp.id, firstName: "Dana", lastName: "Buyer", title: "Purchasing Manager",
    email: "dana@acmedemo.example", phone: "801-555-0101", isPrimary: true,
  });

  await db.insert(activities).values([
    { bpId: bp.id, userId: admin.id, type: "note", content: "Intro call — interested in 250 branded tees for Q3 event.", isSystem: false, createdAt: daysAgo(3) },
    { bpId: bp.id, userId: admin.id, type: "call", content: "Left voicemail with pricing follow-up.", isSystem: false, createdAt: daysAgo(2) },
    { bpId: bp.id, userId: admin.id, type: "other", content: "Stage changed to Prospect", isSystem: true, createdAt: daysAgo(2) },
  ]);

  const [quote] = await db.insert(quotes).values({
    quoteNumber: "QUO-DEMO1", bpId: bp.id, templateId: template?.id ?? null, status: "sent",
    subtotal: "1875.00", chargesTotal: "145.00", discount: "0", total: "2020.00",
    notes: "Front + back print, navy tees. Proof required before production.", createdBy: admin.id,
  }).returning({ id: quotes.id });
  await db.insert(quoteLines).values([
    { quoteId: quote.id, description: "Premium Tee — Navy", qty: 250, unitPrice: "6.50", extended: "1625.00", sortOrder: 0 },
    { quoteId: quote.id, description: "Add-on: Left-chest embroidery", qty: 250, unitPrice: "1.00", extended: "250.00", sortOrder: 1 },
  ]);
  await db.insert(quoteCharges).values([
    { quoteId: quote.id, key: "setup", label: "Screen setup (2 colors)", type: "per_color", rate: "45.00", inputQty: "2", amount: "90.00" },
    { quoteId: quote.id, key: "rush", label: "Rush handling", type: "flat", rate: "55.00", inputQty: "1", amount: "55.00" },
  ]);

  const orderToken = tok();
  const [order] = await db.insert(orders).values({
    orderNumber: "SO-DEMO1", bpId: bp.id, quoteId: quote.id, stage: "production",
    publicToken: orderToken, createdBy: admin.id,
  }).returning({ id: orders.id });
  await db.insert(orderEvents).values([
    { orderId: order.id, stage: "received", byUserId: admin.id, at: daysAgo(2) },
    { orderId: order.id, stage: "art_proof", byUserId: admin.id, at: daysAgo(1) },
    { orderId: order.id, stage: "production", byUserId: admin.id, at: daysAgo(0) },
  ]);

  const applyToken = tok();
  const [pendingDoc] = await db.insert(customerDocuments).values({
    bpId: bp.id, docType: "terms_application", token: applyToken, status: "pending", requestedBy: admin.id,
  }).returning({ id: customerDocuments.id });
  const [doneDoc] = await db.insert(customerDocuments).values({
    bpId: bp.id, docType: "credit_card_application", token: tok(), status: "completed",
    signedName: "Dana Buyer", submittedAt: daysAgo(1), ip: "203.0.113.7", requestedBy: admin.id,
    data: { businessName: "Acme Demo Co", apEmail: "ap@acmedemo.example", apContact: "Dana Buyer" },
  }).returning({ id: customerDocuments.id });

  // Meeting today at 14:00 local for the calendar + detail + reschedule shots.
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14, 0, 0);
  const [meeting] = await db.insert(meetings).values({
    meetingTypeId: mtype?.id ?? null, hostUserId: admin.id, bpId: bp.id,
    attendeeName: "Dana Buyer", attendeeEmail: "dana@acmedemo.example", attendeePhone: "801-555-0101",
    startAt: start, endAt: new Date(start.getTime() + 30 * 60000),
    notes: "Review proof and confirm ship date.", source: "staff",
  }).returning({ id: meetings.id });

  // ---- Mint a session cookie for the admin ---------------------------------
  const sid = randomUUID();
  const exp = new Date(Date.now() + 2 * 3600 * 1000);
  await db.insert(sessions).values({ id: sid, userId: admin.id, expiresAt: exp });
  const jwt = await new SignJWT({ sid })
    .setProtectedHeader({ alg: "HS256" }).setSubject(admin.id).setIssuedAt()
    .setExpirationTime(Math.floor(exp.getTime() / 1000))
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));

  // ---- Capture -------------------------------------------------------------
  const authed: [string, string][] = [
    ["dashboard", "/dashboard"],
    ["notifications", "/notifications"],
    ["security", "/account/security"],
    ["scheduling-setup", "/account/scheduling"],
    ["crm-list", "/crm"],
    ["crm-new", "/crm/new"],
    ["crm-detail", `/crm/${bp.id}`],
    ["pipeline", "/crm/pipeline"],
    ["quote-new", "/sales/quotes/new"],
    ["quote-builder", `/sales/quotes/${quote.id}`],
    ["order-detail", `/sales/orders/${order.id}`],
    ["automations", "/sales/automations"],
    ["calendar", "/calendar"],
    ["meeting-detail", `/calendar/${meeting.id}`],
    ["reschedule", `/calendar/${meeting.id}/reschedule`],
    ["admin-users", "/admin/users"],
    ["admin-user-edit", `/admin/users/${admin.id}`],
    ["admin-groups", "/admin/account-groups"],
    ["admin-templates", "/admin/templates"],
    ["admin-config", "/admin/config"],
    ["admin-audit", "/admin/audit"],
  ];
  if (template) authed.push(["admin-template-edit", `/admin/templates/${template.id}`]);
  if (campaign) authed.push(["automation-detail", `/sales/automations/${campaign.id}`]);

  const publics: [string, string][] = [
    ["login", "/login"],
    ["forgot", "/forgot-password"],
    ["lead", "/lead"],
    ["schedule", "/schedule/cwall"],
    ["apply", `/apply/${applyToken}`],
    ["track", `/track/${orderToken}`],
  ];

  const browser = await chromium.launch();
  const shoot = async (ctx: import("playwright").BrowserContext, name: string, path: string) => {
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 45000 });
    } catch {
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    }
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    await page.close();
    console.log(`  ✓ ${name}.png  (${path})`);
  };

  const authCtx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
  await authCtx.addCookies([{ name: "mr_session", value: jwt, domain: "makeready.g54.com", path: "/", httpOnly: true, secure: true, sameSite: "Lax", expires: Math.floor(exp.getTime() / 1000) }]);
  console.log("Authenticated screenshots:");
  for (const [n, p] of authed) await shoot(authCtx, n, p);

  const pubCtx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
  console.log("Public screenshots:");
  for (const [n, p] of publics) await shoot(pubCtx, n, p);

  await browser.close();

  // ---- Cleanup -------------------------------------------------------------
  await db.delete(sessions).where(eq(sessions.id, sid));
  await db.delete(meetings).where(eq(meetings.id, meeting.id));
  await db.delete(customerDocuments).where(eq(customerDocuments.id, pendingDoc.id));
  await db.delete(customerDocuments).where(eq(customerDocuments.id, doneDoc.id));
  await db.delete(orders).where(eq(orders.id, order.id)); // events cascade
  await db.delete(quotes).where(eq(quotes.id, quote.id)); // lines/charges cascade
  await db.delete(businessPartners).where(eq(businessPartners.id, bp.id)); // contacts/activities cascade
  if (relaxMfa) await db.update(systemSettings).set({ requireMfa: true });
  console.log("Demo data removed.");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
