/**
 * Import SAP A/P invoices (GMGoLive OPCH) into MakeReady `bills` as HISTORICAL
 * records only — status 'paid', header-level, matched to vendors by name.
 *
 * IMPORTANT: these are NOT posted to the GL. Their expenses are already in the
 * ledger (via the JDT1 full-GL import); re-posting would double-count. This is
 * purely vendor-spend history / AP lookup.
 *
 * Reads C:\Users\CWall\gmw-bills.txt (DocEntry|NumAtCard|DocDate|DocTotal|CardName).
 * created_at is set to the real bill date so recent ones surface in the list.
 * Idempotent: clears prior bills with bill_number like 'SAP-%'.
 * Run: node scripts/import-sap-bills.mjs
 */
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => { const m = env.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim().replace(/^["']|["']$/g, "") : undefined; };
const sql = neon(get("DATABASE_URL") || get("POSTGRES_URL"));
const FILE = "C:\\Users\\CWall\\gmw-bills.txt";

const clean = (n) => n.trim().replace(/^\*+[^*]*\*+\s*/, "").trim();
const rows = readFileSync(FILE, "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l.includes("|")).map((l) => {
  const [docEntry, ref, date, total, name] = l.split("|");
  return { docEntry: docEntry.trim(), ref: (ref || "").trim() || null, date: (date || "").trim(), total: Number(total), name: clean(name || "") };
}).filter((r) => r.docEntry && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(r.total));

const vmap = new Map((await sql`select id, lower(name) n from vendors`).map((v) => [v.n, v.id]));
const vid = (name) => vmap.get((name || "").toLowerCase()) ?? null;

const del = await sql`delete from bills where bill_number like 'SAP-%' returning id`;
console.log(`${rows.length} bills to import; cleared ${del.length} prior SAP bills`);

const CHUNK = 500;
let n = 0, matched = 0;
for (let i = 0; i < rows.length; i += CHUNK) {
  const batch = rows.slice(i, i + CHUNK).map((r) => {
    const v = vid(r.name); if (v) matched++;
    return {
      bill_number: "SAP-" + r.docEntry,
      vendor_id: v,
      vendor_ref: r.ref,
      status: "paid",
      issue_date: r.date,
      created_at: r.date + "T12:00:00Z",
      subtotal: r.total.toFixed(2),
      total: r.total.toFixed(2),
      notes: "Historical A/P from SAP — " + (r.name || "vendor") + " (not GL-posted; expense already in GL)",
    };
  });
  await sql`insert into bills (bill_number, vendor_id, vendor_ref, status, issue_date, created_at, subtotal, total, notes)
    select bill_number, vendor_id::uuid, vendor_ref, status::bill_status, issue_date::timestamptz, created_at::timestamptz, subtotal::numeric, total::numeric, notes
    from json_to_recordset(${JSON.stringify(batch)}::json) as x(bill_number text, vendor_id text, vendor_ref text, status text, issue_date text, created_at text, subtotal text, total text, notes text)`;
  n += batch.length;
  if (n % 20000 < CHUNK) console.log(`  inserted ${n}/${rows.length}`);
}
console.log(`Done — ${n} bills imported; ${matched} linked to a vendor.`);
