/**
 * Import the vendor master from the SAP B1 backup (GMGoLive OCRD, CardType='S')
 * into the MakeReady vendors table. Reads C:\Users\CWall\gmw-vendors.txt
 * (pipe-delimited: name|phone|email|address|terms) — active suppliers that have
 * A/P invoices. Strips SAP data-quality markers (***...***) from names.
 * Idempotent on name. Run: node scripts/import-sap-vendors.mjs
 */
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => { const m = env.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim().replace(/^["']|["']$/g, "") : undefined; };
const sql = neon(get("DATABASE_URL") || get("POSTGRES_URL"));
const FILE = "C:\\Users\\CWall\\gmw-vendors.txt";

const clean = (n) => n.trim().replace(/^\*+[^*]*\*+\s*/, "").trim();
const nz = (s) => { const t = (s ?? "").trim(); return t || null; };

const parsed = readFileSync(FILE, "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l.includes("|")).map((l) => {
  const [name, phone, email, address, terms] = l.split("|");
  return { name: clean(name), phone: nz(phone), email: nz(email), address: nz(address), terms: nz(terms) };
}).filter((r) => r.name && r.name.length > 1 && !/do not use/i.test(r.name));

const byName = new Map();
for (const r of parsed) if (!byName.has(r.name.toLowerCase())) byName.set(r.name.toLowerCase(), r);
const all = [...byName.values()];

const existing = new Set((await sql`select lower(name) n from vendors`).map((x) => x.n));
const fresh = all.filter((r) => !existing.has(r.name.toLowerCase()));
console.log(`${all.length} unique vendors in export; ${existing.size} already present; ${fresh.length} to insert`);

const CHUNK = 200;
let inserted = 0;
for (let i = 0; i < fresh.length; i += CHUNK) {
  const batch = fresh.slice(i, i + CHUNK);
  await sql`insert into vendors (name, phone, email, address, terms, active)
    select name, phone, email, address, terms, true
    from json_to_recordset(${JSON.stringify(batch)}::json) as x(name text, phone text, email text, address text, terms text)`;
  inserted += batch.length;
  console.log(`  inserted ${inserted}/${fresh.length}`);
}
console.log(`Done — ${inserted} vendors imported.`);
