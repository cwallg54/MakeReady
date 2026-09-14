/**
 * Build the semi-monthly payroll journal template from the real chart of
 * accounts, matching the entry finance types by hand twice a month in SAP.
 *
 * The shape came off the manual journals in the backup: wages split across the
 * production departments (Art / Embroidery / Warehouse / Silkscreen) and the
 * overhead functions (Management / Sales / Purchasing / Office / Development),
 * overtime against the same departments, then employer taxes and benefits,
 * with the net credited to Payroll Payable.
 *
 * Idempotent. Run: node --env-file=.env.local scripts/seed-payroll-template.mjs
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const TEMPLATE = "Semi-monthly payroll";

// account code, label, side, grouping — in the order the payroll report reads.
const LINES = [
  // Wages by production department
  ["5005510", "Wages — Art", "debit", "Wages"],
  ["5005520", "Wages — Embroidery", "debit", "Wages"],
  ["5005530", "Wages — Warehouse", "debit", "Wages"],
  ["5005540", "Wages — Silkscreen", "debit", "Wages"],
  // Wages by overhead function
  ["6005640", "Wages — Management", "debit", "Wages"],
  ["6005650", "Wages — Sales", "debit", "Wages"],
  ["6005660", "Wages — Purchasing", "debit", "Wages"],
  ["6005670", "Wages — Office", "debit", "Wages"],
  ["6005690", "Wages — Development", "debit", "Wages"],
  // Overtime
  ["5010510", "Overtime — Art", "debit", "Overtime"],
  ["5010520", "Overtime — Embroidery", "debit", "Overtime"],
  ["5010530", "Overtime — Warehouse", "debit", "Overtime"],
  ["5010540", "Overtime — Silkscreen", "debit", "Overtime"],
  ["6010650", "Overtime — Sales", "debit", "Overtime"],
  ["6010660", "Overtime — Purchasing", "debit", "Overtime"],
  ["6010670", "Overtime — Office", "debit", "Overtime"],
  ["6010690", "Overtime — Development", "debit", "Overtime"],
  // Employer taxes and benefits
  ["6090690", "Employer payroll taxes", "debit", "Taxes"],
  ["6106690", "Insurance — medical", "debit", "Benefits"],
  ["6109690", "Insurance — dental", "debit", "Benefits"],
  ["6136690", "H.S.A. employer contribution", "debit", "Benefits"],
  ["6121690", "401(k) employer contribution", "debit", "Benefits"],
  ["6111690", "Vacation accrued", "debit", "Benefits"],
  // Employee-side withholdings held until they are remitted
  ["2121000", "H.S.A. employee withheld", "credit", "Payable"],
  // Net pay
  ["2106000", "Net pay — Payroll Payable", "credit", "Payable"],
];

// There is no unique constraint on the name, so look before inserting —
// otherwise re-running quietly builds a second copy of the template.
const DESCRIPTION =
  "Wages by department, overtime, employer taxes and benefits, net to Payroll Payable. Paid on the 10th and the 25th.";
const existingTpl = await sql`select id from payroll_templates where name = ${TEMPLATE} order by created_at limit 1`;
let templateId = existingTpl[0]?.id;
if (templateId) {
  await sql`update payroll_templates set description = ${DESCRIPTION}, active = true, updated_at = now() where id = ${templateId}`;
} else {
  const [tpl] = await sql`
    insert into payroll_templates (name, description, active)
    values (${TEMPLATE}, ${DESCRIPTION}, true)
    returning id`;
  templateId = tpl.id;
}
if (!templateId) throw new Error("could not create or find the template");
console.log(`template: ${TEMPLATE} (${templateId})`);

let added = 0;
let missing = [];

for (const [i, [code, label, side, grouping]] of LINES.entries()) {
  const acct = await sql`select id, name from gl_accounts where code = ${code} and active limit 1`;
  if (!acct.length) {
    missing.push(`${code} ${label}`);
    continue;
  }
  const existing = await sql`
    select id from payroll_template_lines where template_id = ${templateId} and account_id = ${acct[0].id} and label = ${label} limit 1`;
  if (existing.length) {
    await sql`update payroll_template_lines set side = ${side}, grouping = ${grouping}, sort_order = ${i * 10} where id = ${existing[0].id}`;
  } else {
    await sql`
      insert into payroll_template_lines (template_id, account_id, label, side, grouping, sort_order)
      values (${templateId}, ${acct[0].id}, ${label}, ${side}, ${grouping}, ${i * 10})`;
    added++;
  }
}

const total = await sql`select count(*)::int n from payroll_template_lines where template_id = ${templateId}`;
console.log(`lines: ${total[0].n} (${added} added this run)`);
if (missing.length) {
  console.log(`\nno account in the chart for ${missing.length} line(s) — skipped:`);
  for (const m of missing) console.log(`  ${m}`);
}

const byGroup = await sql`
  select grouping, count(*)::int n from payroll_template_lines where template_id = ${templateId}
  group by grouping order by min(sort_order)`;
console.log("\nshape:");
for (const g of byGroup) console.log(` ${String(g.grouping).padEnd(10)} ${g.n} line(s)`);
