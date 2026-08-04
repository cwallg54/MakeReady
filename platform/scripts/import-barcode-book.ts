import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { readFileSync } from "fs";
import { sql } from "drizzle-orm";
import { db } from "../src/db";
import { designItems, designBarcodes, designSuffixes, businessPartners } from "../src/db/schema";

const DIR = "C:\\Users\\CWall\\gmw-import";
const readNdjson = (f: string) => readFileSync(`${DIR}\\${f}`, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

const num = (v: unknown): string | null => {
  if (v == null) return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? String(n) : null;
};

async function batchInsert<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>, size = 1000) {
  for (let i = 0; i < rows.length; i += size) {
    await insert(rows.slice(i, i + size));
    if (i % 10000 === 0) process.stdout.write(`  …${i}\n`);
  }
}

async function main() {
  console.log("Clearing existing design library rows…");
  await db.delete(designBarcodes);
  await db.delete(designItems);

  // Suffixes (upsert by code; keep first group seen).
  const suffixes = readNdjson("suffixes.ndjson");
  for (const s of suffixes) {
    await db.insert(designSuffixes).values({ code: s.code, label: s.label, kind: s.kind }).onConflictDoNothing({ target: designSuffixes.code });
  }
  console.log(`Suffixes: ${suffixes.length} processed.`);

  // Customer lookup: legacy code (e.g. CSER043) → bp id. Design cust numbers omit the leading "C".
  const bps = await db.select({ id: businessPartners.id, legacyCode: businessPartners.legacyCode }).from(businessPartners);
  const bpByLegacy = new Map<string, string>();
  for (const b of bps) if (b.legacyCode) bpByLegacy.set(b.legacyCode.toUpperCase(), b.id);
  const matchBp = (cust: string | null | undefined) => {
    if (!cust || cust.toUpperCase() === "NEW") return null;
    const c = cust.toUpperCase();
    return bpByLegacy.get(c) ?? bpByLegacy.get(`C${c}`) ?? null;
  };

  // Design items.
  const items = readNdjson("design_items.ndjson");
  let matched = 0;
  const itemRows = items.map((r) => {
    const bpId = matchBp(r.custNumber);
    if (bpId) matched++;
    const esm = r.catalog === "esm";
    return {
      itemNumber: String(r.itemNumber).slice(0, 200),
      custNumber: r.custNumber ?? null,
      designBase: r.designBase ?? null,
      description: r.description ?? null,
      catalog: r.catalog ?? "g54",
      brandCode: esm ? "ESM" : "G54",
      bpId,
      printing: r.printing ?? null,
      royalty: r.royalty ?? null,
      location: r.location ?? null,
      salesperson: r.salesperson ?? null,
      assigneeInitials: r.assigneeInitials ?? null,
      stitchCount: typeof r.stitchCount === "number" ? r.stitchCount : null,
      source: r.source ?? null,
      setup: r.setup ?? null,
      status: (/done/i.test(String(r.setup ?? "")) ? "active" : "draft") as "active" | "draft",
      isException: esm,
      archived: !!r.archived,
      archiveTag: r.archiveTag ?? null,
    };
  });
  console.log(`Design items: ${itemRows.length} rows, ${matched} matched to a customer. Inserting…`);
  await batchInsert(itemRows, (chunk) => db.insert(designItems).values(chunk));

  // Map full item number → design item id, to link barcodes.
  const idRows = await db.select({ id: designItems.id, itemNumber: designItems.itemNumber }).from(designItems);
  const idByNumber = new Map<string, string>();
  for (const r of idRows) if (!idByNumber.has(r.itemNumber)) idByNumber.set(r.itemNumber, r.id);

  // Barcodes.
  const bcs = readNdjson("barcodes.ndjson");
  let linked = 0;
  const bcRows = bcs.map((r) => {
    const designItemId = r.designNumber ? idByNumber.get(String(r.designNumber)) ?? null : null;
    if (designItemId) linked++;
    return {
      designItemId,
      designNumber: r.designNumber ?? null,
      barcode12: r.barcode12 ?? null,
      barcode10: r.barcode10 ?? null,
      description: r.description ?? null,
      custNumber: r.custNumber ?? null,
      custItemNumber: r.custItemNumber ?? null,
      customerBarcode: r.customerBarcode ?? null,
      cost: num(r.cost),
      garmentType: r.garmentType ?? null,
      color: r.color ?? null,
      size: r.size ?? null,
      retail: r.retail ?? null,
      catalog: r.catalog ?? "g54",
      archived: !!r.archived,
    };
  });
  console.log(`Barcodes: ${bcRows.length} rows, ${linked} linked to a design. Inserting…`);
  await batchInsert(bcRows, (chunk) => db.insert(designBarcodes).values(chunk));

  const [{ c }] = await db.select({ c: sql<number>`count(*)::int` }).from(designItems);
  const [{ b }] = await db.select({ b: sql<number>`count(*)::int` }).from(designBarcodes);
  console.log(`Done. design_items=${c} design_barcodes=${b}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
