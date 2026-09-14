import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { SignJWT } from "jose";
import { randomUUID } from "crypto";
import { mkdirSync, writeFileSync } from "fs";
import { chromium } from "playwright";
import { db } from "../src/db";
import { users, sessions } from "../src/db/schema";
import { sql } from "drizzle-orm";

/**
 * Capture the screenshots the user guide is built from, against a running dev
 * server signed in as a real administrator. Re-run it whenever the UI moves and
 * every picture in the guide is current again — that is the whole point of
 * generating them rather than pasting them in by hand.
 *
 * Needs: a dev server (default http://localhost:3100), AUTH_SECRET, DATABASE_URL.
 * Run: pnpm guide:shots
 */
const BASE = process.env.SHOT_URL ?? "http://localhost:3100";
// The app serves these, so they live in public/ rather than in a docs
// folder that never reaches the deploy.
const OUT = "public/help/guide";
const EMAIL = (process.env.SHOT_EMAIL ?? "cwall@g54.com").toLowerCase();

/** slug -> path. Ordered the way the guide walks through the business. */
type Shot = { slug: string; path: string; full?: boolean };

/** First column of the first row, or null — a missing record just drops the shot. */
const one = async (q: string): Promise<string | null> => {
  try {
    const r = (await db.execute(sql.raw(q))) as unknown as Record<string, unknown>[];
    const rows = Array.isArray(r) ? r : ((r as { rows?: Record<string, unknown>[] }).rows ?? []);
    return rows.length ? String(Object.values(rows[0])[0]) : null;
  } catch {
    return null;
  }
};

async function shots(): Promise<Shot[]> {
  // Dynamic pages need a real record, picked fresh so the guide never points at
  // something that has since been deleted.
  const bp = await one(`select id from business_partners order by updated_at desc nulls last limit 1`);
  const order = await one(`select id from orders where voided_at is null order by created_at desc limit 1`);
  const art = await one(`select id from art_requests order by created_at desc limit 1`);
  const prod = await one(`select id from production_jobs order by created_at desc limit 1`);
  const invoice = await one(`select id from invoices where status in ('sent','partial') order by issue_date desc limit 1`);
  const bill = await one(`select id from bills where status in ('open','partial') order by due_date asc limit 1`);
  const po = await one(`select id from purchase_orders order by created_at desc limit 1`);
  const stmtBp = await one(
    `select bp_id from invoices where status in ('sent','partial') and bp_id is not null
     group by bp_id order by count(*) desc limit 1`,
  );

  const list: (Shot | null)[] = [
    // ---- getting in -------------------------------------------------------
    { slug: "01-login", path: "/login" },
    { slug: "02-dashboard", path: "/dashboard" },
    { slug: "03-search", path: "/search?q=hat" },
    { slug: "04-notifications", path: "/notifications" },

    // ---- 1. find and qualify the work ------------------------------------
    { slug: "10-crm-list", path: "/crm" },
    { slug: "11-crm-pipeline", path: "/crm/pipeline" },
    { slug: "12-crm-new", path: "/crm/new" },
    bp ? { slug: "13-customer", path: `/crm/${bp}`, full: true } : null,
    bp ? { slug: "14-customer-pricing", path: `/crm/${bp}/pricing` } : null,
    { slug: "15-reorders", path: "/crm/reorders" },

    // ---- 2. quote ---------------------------------------------------------
    { slug: "20-quote-new", path: "/sales/quotes/new" },
    { slug: "21-sales-hub", path: "/sales" },
    { slug: "22-designs", path: "/designs" },
    { slug: "23-catalog", path: "/admin/catalog" },

    // ---- 3. order ---------------------------------------------------------
    { slug: "30-orders", path: "/sales/orders" },
    order ? { slug: "31-order", path: `/sales/orders/${order}`, full: true } : null,

    // ---- 4. art -----------------------------------------------------------
    { slug: "40-art-queue", path: "/art" },
    art ? { slug: "41-art-job", path: `/art/${art}`, full: true } : null,
    { slug: "42-art-schedule", path: "/art/schedule" },
    { slug: "43-content-library", path: "/content-library" },

    // ---- 5. buy the blanks ------------------------------------------------
    { slug: "50-inventory", path: "/inventory" },
    { slug: "51-purchase-orders", path: "/inventory/purchase-orders" },
    po ? { slug: "52-purchase-order", path: `/inventory/purchase-orders/${po}`, full: true } : null,
    { slug: "53-forecast", path: "/inventory/forecast" },
    { slug: "54-grni", path: "/accounting/grni" },

    // ---- 6. make it -------------------------------------------------------
    { slug: "60-production-schedule", path: "/production/schedule" },
    prod ? { slug: "61-production-job", path: `/production/${prod}`, full: true } : null,
    { slug: "62-quality", path: "/quality" },
    { slug: "63-maintenance", path: "/maintenance/work-orders" },

    // ---- 7. bill it -------------------------------------------------------
    { slug: "70-invoices", path: "/accounting/invoices" },
    invoice ? { slug: "71-invoice", path: `/accounting/invoices/${invoice}`, full: true } : null,
    { slug: "72-invoice-new", path: "/accounting/invoices/new" },

    // ---- 8. get paid ------------------------------------------------------
    { slug: "80-payments", path: "/accounting/payments" },
    { slug: "81-deposits", path: "/accounting/deposits" },
    { slug: "82-aging", path: "/accounting/aging" },
    { slug: "83-collections", path: "/accounting/collections" },
    stmtBp ? { slug: "84-statement", path: `/accounting/statements/${stmtBp}`, full: true } : null,
    { slug: "85-credit-memos", path: "/accounting/credit-memos" },
    { slug: "86-credit-requests", path: "/accounting/credit-requests" },

    // ---- 9. pay everyone else --------------------------------------------
    { slug: "90-bills", path: "/accounting/bills" },
    bill ? { slug: "91-bill", path: `/accounting/bills/${bill}`, full: true } : null,
    { slug: "92-payment-runs", path: "/accounting/payment-runs" },
    { slug: "93-vendor-credits", path: "/accounting/vendor-credits" },
    { slug: "94-expenses", path: "/accounting/expenses" },
    { slug: "95-payroll", path: "/accounting/payroll" },

    // ---- 10. close the books ---------------------------------------------
    { slug: "a0-accounting-hub", path: "/accounting" },
    { slug: "a1-periods", path: "/accounting/periods" },
    { slug: "a2-close", path: "/accounting/close" },
    { slug: "a3-journal", path: "/accounting/journal" },
    { slug: "a4-trial-balance", path: "/accounting/trial-balance" },
    { slug: "a5-income-statement", path: "/accounting/income-statement" },
    { slug: "a6-balance-sheet", path: "/accounting/balance-sheet" },
    { slug: "a7-cash-flow", path: "/accounting/cash-flow" },
    { slug: "a8-reconcile", path: "/accounting/reconcile" },
    { slug: "a9-sales-tax", path: "/accounting/tax-filing" },

    // ---- 11. watch the numbers -------------------------------------------
    { slug: "b0-flash", path: "/accounting/flash" },
    { slug: "b1-quarterly", path: "/accounting/quarterly" },
    { slug: "b2-segment-pnl", path: "/accounting/segment-pnl" },
    { slug: "b3-goals", path: "/accounting/goals" },
    { slug: "b4-commission", path: "/accounting/commission" },
    { slug: "b5-job-costing", path: "/controlling/job-costing" },
    { slug: "b6-profitability", path: "/controlling/profitability" },
    { slug: "b7-budget", path: "/controlling/budget" },

    // ---- 12. reporting ----------------------------------------------------
    { slug: "c0-reports", path: "/reports" },
    { slug: "c1-report-new", path: "/reports/new" },
    { slug: "c2-sales-analysis", path: "/reports/standard/sales-analysis" },
    { slug: "c3-credit-report", path: "/reports/standard/credit" },
    { slug: "c4-open-orders", path: "/reports/standard/open-orders-by-salesperson" },
    { slug: "c5-rep-activity", path: "/reports/standard/rep-activity" },
    { slug: "c6-report-access", path: "/reports/access" },

    // ---- 13. the shop window ---------------------------------------------
    { slug: "d0-web-store", path: "/web-store" },
    { slug: "d1-web-store-orders", path: "/web-store/orders" },
    { slug: "d2-storefront", path: "/shop" },

    // ---- 14. running the place -------------------------------------------
    { slug: "e1-users", path: "/admin/users" },
    { slug: "e2-teams", path: "/admin/teams" },
    { slug: "e3-workflows", path: "/workflows" },
    { slug: "e4-approvals", path: "/workflows/approvals" },
    { slug: "e5-audit", path: "/admin/audit" },
    { slug: "e6-config", path: "/admin/config" },
    { slug: "e7-security", path: "/account/security" },
  ];
  return list.filter(Boolean) as Shot[];
}

/**
 * Runs inside the browser. Kept as a string because the TypeScript loader
 * injects helpers (__name) that do not exist on the page.
 */
const PAGE_OUTLINE = `(() => {
  const texts = (sel) => [...new Set([...document.querySelectorAll(sel)]
    .map((e) => (e.textContent || "").replace(/\s+/g, " ").trim()))]
    .filter((t) => t && t.length < 80).slice(0, 24);
  return {
    title: (document.querySelector("h1") || {}).textContent
      ? document.querySelector("h1").textContent.replace(/\s+/g, " ").trim() : "",
    headings: texts("main h2, main h3"),
    actions: texts("main button, main a[href]"),
    columns: texts("main thead th"),
  };
})()`;

async function main() {
  mkdirSync(OUT, { recursive: true });

  const user = await db.query.users.findFirst({ where: eq(users.email, EMAIL) });
  if (!user) throw new Error(`No user ${EMAIL} — set SHOT_EMAIL`);

  const sid = randomUUID();
  const expiresAt = new Date(Date.now() + 90 * 60_000);
  await db.insert(sessions).values({ id: sid, userId: user.id, expiresAt });
  const token = await new SignJWT({ sid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));

  const list = await shots();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    // 1440px across is 240dpi at the 6in the guide prints them — sharp enough
    // for print, and a quarter of the file size of a 2x capture.
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const url = new URL(BASE);
  await ctx.addCookies([{ name: "mr_session", value: token, domain: url.hostname, path: "/" }]);
  const page = await ctx.newPage();

  let ok = 0;
  const failed: string[] = [];
  const outline: Record<string, unknown> = {};
  for (const s of list) {
    try {
      // A cold serverless database connection drops now and then; one retry
      // keeps a whole capture run from being spoiled by a blip.
      let status = 0;
      for (let attempt = 0; attempt < 2 && status !== 200; attempt++) {
        if (attempt) await page.waitForTimeout(2_000);
        const res = await page.goto(`${BASE}${s.path}`, { waitUntil: "networkidle", timeout: 120_000 });
        status = res?.status() ?? 0;
      }
      if (status !== 200) {
        failed.push(`${s.slug} (${status}) ${s.path}`);
        console.log(`FAIL ${status} ${s.path}`);
        continue;
      }
      // The dev server's own overlay is not part of the product.
      await page.addStyleTag({ content: "nextjs-portal,#__next-build-watcher{display:none!important}" });
      // Charts animate in; give them a beat so the picture is not half-drawn.
      await page.waitForTimeout(900);
      await page.screenshot({
        path: `${OUT}/${s.slug}.png`,
        fullPage: !!s.full,
        // A very long page makes an unreadable figure; cap it.
        ...(s.full ? { clip: undefined } : {}),
      });
      // What the page actually offers, so the guide can describe the real
      // screen rather than an author's memory of it. Passed as source text:
      // tsx rewrites inline functions in a way the browser cannot run.
      outline[s.slug] = await page.evaluate(PAGE_OUTLINE);
      ok++;
      console.log(`ok   ${s.slug.padEnd(24)} ${s.path}`);
    } catch (e) {
      failed.push(`${s.slug} — ${(e as Error).message.split("\n")[0]}`);
      console.log(`FAIL      ${s.path} — ${(e as Error).message.split("\n")[0]}`);
    }
  }

  writeFileSync(`../docs/training/screenshots-outline.json`, JSON.stringify(outline, null, 2));
  await browser.close();
  await db.delete(sessions).where(eq(sessions.id, sid));
  console.log(`\n${ok}/${list.length} captured into public/help/guide`);
  if (failed.length) {
    console.log("failed:");
    for (const f of failed) console.log(`  ${f}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
