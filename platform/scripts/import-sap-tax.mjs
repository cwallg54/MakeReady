/**
 * Seed the sales-tax codes from the SAP setup: one code per state of nexus at
 * the state rate, plus an exempt code. Rates come straight from OSTC.
 *
 * Then default each customer's tax code from its ship-to state, so tax is
 * charged against where the goods go rather than a single global rate.
 *
 * Idempotent. Run: node --env-file=.env.local scripts/import-sap-tax.mjs
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

// Read off OSTC in the SAP backup — the states where tax is actually collected.
const CODES = [
  { code: "AR", name: "Arkansas", state: "AR", rate: 0.05125 },
  { code: "AZ", name: "Arizona", state: "AZ", rate: 0.056 },
  { code: "CA", name: "California", state: "CA", rate: 0.075 },
  { code: "CO", name: "Colorado", state: "CO", rate: 0.029 },
  { code: "CT", name: "Connecticut", state: "CT", rate: 0.06 },
  { code: "ID", name: "Idaho", state: "ID", rate: 0.06 },
  { code: "IL", name: "Illinois", state: "IL", rate: 0.0625 },
  { code: "ME", name: "Maine", state: "ME", rate: 0.05 },
  { code: "MI", name: "Michigan", state: "MI", rate: 0.06 },
  { code: "MT", name: "Montana", state: "MT", rate: 0.0 },
  { code: "NM", name: "New Mexico", state: "NM", rate: 0.05 },
  { code: "OH", name: "Ohio", state: "OH", rate: 0.06 },
  { code: "PA", name: "Pennsylvania", state: "PA", rate: 0.06 },
  { code: "TX", name: "Texas", state: "TX", rate: 0.0625 },
  { code: "UT", name: "Utah", state: "UT", rate: 0.0765 },
  { code: "WA", name: "Washington", state: "WA", rate: 0.065 },
  { code: "WY", name: "Wyoming", state: "WY", rate: 0.04 },
  { code: "EX", name: "Exempt", state: null, rate: 0.0, exempt: true },
];

const [liability] = await sql`select id from gl_accounts where system_key = 'sales_tax' and active limit 1`;
const fallback = await sql`select id from gl_accounts where code = '2222000' limit 1`;
const liabilityId = liability?.id ?? fallback[0]?.id ?? null;
console.log(`sales-tax liability account: ${liabilityId ?? "not configured"}`);

for (const [i, c] of CODES.entries()) {
  await sql`
    insert into tax_codes (code, name, state, rate, exempt, active, liability_account_id, sort_order)
    values (${c.code}, ${c.name}, ${c.state}, ${c.rate}, ${c.exempt ?? false}, true, ${liabilityId}, ${i * 10})
    on conflict (code) do update set name = excluded.name, state = excluded.state, rate = excluded.rate,
      exempt = excluded.exempt, liability_account_id = excluded.liability_account_id, sort_order = excluded.sort_order`;
}
console.log(`tax codes: ${CODES.length}`);

// Default each customer to the code for its state.
const matched = await sql`
  update business_partners b set tax_code_id = t.id, updated_at = now()
  from tax_codes t
  where t.state = upper(trim(b.address_state)) and b.tax_code_id is null
  returning b.id`;
console.log(`customers defaulted from their state: ${matched.length}`);

const bystate = await sql`
  select coalesce(t.code, '(none)') code, coalesce(t.name, 'No nexus / not set') name,
         (t.rate * 100)::numeric(6,3) pct, count(b.id)::int customers
  from business_partners b left join tax_codes t on t.id = b.tax_code_id
  group by t.code, t.name, t.rate order by count(b.id) desc limit 12`;
console.log("\ncustomers by tax jurisdiction:");
for (const r of bystate) {
  console.log(` ${String(r.code).padEnd(8)} ${String(r.name).padEnd(22)} ${String(r.pct ?? "").padStart(6)}%  ${String(r.customers).padStart(5)}`);
}

const noNexus = await sql`
  select count(*)::int n from business_partners b
  where b.tax_code_id is null and b.address_state is not null and trim(b.address_state) <> ''`;
console.log(`\ncustomers in states with no nexus code: ${noNexus[0].n} (they bill untaxed)`);
