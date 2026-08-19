import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { fixedAssets, depreciationRuns, depreciationLines, glAccounts, journalEntries } from "@/db/schema";
import { createJournal, type DraftLine } from "@/lib/accounting/journal";
import { nextDocNumber } from "@/lib/number-series";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface AssetCalc {
  monthly: number; // straight-line monthly depreciation
  depreciableBase: number; // cost − salvage
  accumulated: number;
  netBookValue: number;
  remaining: number; // still-to-depreciate (base − accumulated)
}

/** Straight-line depreciation math for one asset. */
export function assetCalc(a: {
  cost: string | number;
  salvageValue: string | number;
  usefulLifeMonths: number;
  accumulatedDepreciation: string | number;
}): AssetCalc {
  const cost = Number(a.cost);
  const salvage = Number(a.salvageValue);
  const life = Math.max(1, a.usefulLifeMonths || 1);
  const accumulated = Number(a.accumulatedDepreciation);
  const depreciableBase = round2(Math.max(0, cost - salvage));
  const monthly = round2(depreciableBase / life);
  const remaining = round2(Math.max(0, depreciableBase - accumulated));
  return { monthly, depreciableBase, accumulated, netBookValue: round2(cost - accumulated), remaining };
}

/** The depreciation an asset should take for one period (never over-depreciates). */
export function periodDepreciation(a: Parameters<typeof assetCalc>[0]): number {
  const c = assetCalc(a);
  return Math.min(c.monthly, c.remaining);
}

/** Ensure a GL account exists by system key, creating it in a free code slot. */
async function ensureAccount(key: string, seed: { code: string; name: string; type: string; subtype: string; description: string }): Promise<string | null> {
  const existing = await db.query.glAccounts.findFirst({ where: eq(glAccounts.systemKey, key), columns: { id: true } });
  if (existing) return existing.id;
  let code = seed.code;
  const base = Number(seed.code);
  for (let i = 0; i < 40; i++) {
    const c = String(base + i);
    const hit = await db.query.glAccounts.findFirst({ where: eq(glAccounts.code, c), columns: { id: true } });
    if (!hit) { code = c; break; }
  }
  try {
    const [row] = await db.insert(glAccounts).values({
      code, name: seed.name, type: seed.type as never, subtype: seed.subtype,
      description: seed.description, systemKey: key, active: true,
    }).returning({ id: glAccounts.id });
    return row?.id ?? null;
  } catch {
    const again = await db.query.glAccounts.findFirst({ where: eq(glAccounts.systemKey, key), columns: { id: true } });
    return again?.id ?? null;
  }
}

export async function ensureAssetAccounts(): Promise<{ asset: string | null; accum: string | null; expense: string | null; gainLoss: string | null }> {
  const asset = await ensureAccount("fixed_assets", { code: "1600", name: "Fixed Assets", type: "asset", subtype: "Fixed Asset", description: "Capitalized equipment, vehicles and furniture at cost." });
  const accum = await ensureAccount("accum_depreciation", { code: "1690", name: "Accumulated Depreciation", type: "asset", subtype: "Fixed Asset", description: "Contra-asset: total depreciation booked against fixed assets." });
  const expense = await ensureAccount("depreciation_expense", { code: "6200", name: "Depreciation Expense", type: "expense", subtype: "Operating Expense", description: "Periodic depreciation of fixed assets." });
  const gainLoss = await ensureAccount("disposal_gain_loss", { code: "7100", name: "Gain/Loss on Asset Disposal", type: "expense", subtype: "Other", description: "Gain or loss recognized when a fixed asset is disposed." });
  return { asset, accum, expense, gainLoss };
}

/** Assets that still have depreciation to take, in service on/before the period. */
async function depreciableAssets(periodEnd: Date) {
  const rows = await db.select().from(fixedAssets).where(eq(fixedAssets.status, "active"));
  return rows.filter((a) => {
    const inService = a.inServiceDate ?? a.acquisitionDate;
    if (inService && inService.getTime() > periodEnd.getTime()) return false;
    return periodDepreciation(a) > 0.005;
  });
}

/** Preview a month's depreciation without posting. */
export async function previewDepreciation(periodYm: string) {
  const periodEnd = new Date(`${periodYm}-28T23:59:59Z`);
  const assets = await depreciableAssets(periodEnd);
  const lines = assets.map((a) => ({ asset: a, amount: periodDepreciation(a) }));
  const total = round2(lines.reduce((s, l) => s + l.amount, 0));
  const already = await db.query.depreciationRuns.findFirst({ where: eq(depreciationRuns.periodYm, periodYm), columns: { id: true, status: true } });
  return { lines, total, already };
}

export type RunResult = { ok: true; runId: string; total: number } | { ok: false; error: string };

/** Post a monthly depreciation run: creates the run, the per-asset lines, one
 *  balanced journal (Dr Depreciation Expense / Cr Accumulated Depreciation), and
 *  advances each asset's accumulated depreciation. One run per period. */
export async function runDepreciation(periodYm: string, userId: string): Promise<RunResult> {
  if (!/^\d{4}-\d{2}$/.test(periodYm)) return { ok: false, error: "Period must be YYYY-MM." };
  const existing = await db.query.depreciationRuns.findFirst({ where: and(eq(depreciationRuns.periodYm, periodYm), ne(depreciationRuns.status, "void")) });
  if (existing) return { ok: false, error: `Depreciation for ${periodYm} has already been run.` };

  const { lines, total } = await previewDepreciation(periodYm);
  if (total <= 0.005 || lines.length === 0) return { ok: false, error: "No depreciation is due for this period." };

  const acc = await ensureAssetAccounts();
  if (!acc.expense || !acc.accum) return { ok: false, error: "GL accounts for depreciation could not be set up." };

  const runNumber = await nextDocNumber("depreciation_run", "DEP-");
  const periodDate = new Date(`${periodYm}-28T00:00:00Z`);

  const [run] = await db.insert(depreciationRuns).values({
    runNumber, periodYm, status: "draft", totalAmount: total.toFixed(2), createdBy: userId,
  }).returning({ id: depreciationRuns.id });

  await db.insert(depreciationLines).values(lines.map((l) => ({ runId: run.id, assetId: l.asset.id, amount: l.amount.toFixed(2) })));

  const draft: DraftLine[] = [
    { accountId: acc.expense, debit: total, credit: 0, memo: `Depreciation ${periodYm}` },
    { accountId: acc.accum, debit: 0, credit: total, memo: `Depreciation ${periodYm}` },
  ];
  const je = await createJournal({ date: periodDate, memo: `Depreciation run ${runNumber} (${periodYm})`, lines: draft, source: "depreciation", sourceId: run.id, post: true }, userId);

  // Advance accumulated depreciation on each asset; mark fully depreciated ones.
  for (const l of lines) {
    const newAccum = round2(Number(l.asset.accumulatedDepreciation) + l.amount);
    const c = assetCalc({ ...l.asset, accumulatedDepreciation: newAccum });
    await db.update(fixedAssets).set({
      accumulatedDepreciation: newAccum.toFixed(2),
      status: c.remaining <= 0.005 ? "fully_depreciated" : "active",
      updatedAt: new Date(),
    }).where(eq(fixedAssets.id, l.asset.id));
  }

  await db.update(depreciationRuns).set({
    status: "posted",
    journalEntryId: je.ok ? je.id : null,
    postedAt: new Date(), postedBy: userId,
  }).where(eq(depreciationRuns.id, run.id));

  return { ok: true, runId: run.id, total };
}

/** Dispose of an asset: remove cost + accumulated depreciation from the GL,
 *  record proceeds to cash, and book the gain/loss on disposal. */
export async function disposeAsset(assetId: string, proceeds: number, date: Date, note: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  const a = await db.query.fixedAssets.findFirst({ where: eq(fixedAssets.id, assetId) });
  if (!a) return { ok: false, error: "Asset not found." };
  if (a.status === "disposed") return { ok: false, error: "Asset is already disposed." };

  const cost = Number(a.cost);
  const accumulated = Number(a.accumulatedDepreciation);
  const nbv = round2(cost - accumulated);
  const gain = round2(proceeds - nbv); // + = gain, − = loss

  const acc = await ensureAssetAccounts();
  const cashRow = await db.query.glAccounts.findFirst({ where: eq(glAccounts.systemKey, "cash"), columns: { id: true } });
  if (acc.asset && acc.accum && acc.gainLoss) {
    const lines: DraftLine[] = [];
    if (accumulated > 0.005) lines.push({ accountId: acc.accum, debit: accumulated, credit: 0, memo: `Remove accum. depr. — ${a.assetNumber}` });
    if (proceeds > 0.005 && cashRow) lines.push({ accountId: cashRow.id, debit: proceeds, credit: 0, memo: `Disposal proceeds — ${a.assetNumber}` });
    if (gain < -0.005) lines.push({ accountId: acc.gainLoss, debit: -gain, credit: 0, memo: `Loss on disposal — ${a.assetNumber}` });
    lines.push({ accountId: acc.asset, debit: 0, credit: cost, memo: `Remove asset cost — ${a.assetNumber}` });
    if (gain > 0.005) lines.push({ accountId: acc.gainLoss, debit: 0, credit: gain, memo: `Gain on disposal — ${a.assetNumber}` });
    if (lines.length >= 2) {
      await createJournal({ date, memo: `Dispose asset ${a.assetNumber} — ${a.name}`, lines, source: "asset_disposal", sourceId: assetId, post: true }, userId);
    }
  }

  await db.update(fixedAssets).set({
    status: "disposed", disposedDate: date, disposalProceeds: proceeds.toFixed(2), disposalNote: note || null, updatedAt: new Date(),
  }).where(eq(fixedAssets.id, assetId));
  return { ok: true };
}

/** Void the GL for a depreciation run (used if a run must be reversed). */
export async function journalForRun(runId: string) {
  const run = await db.query.depreciationRuns.findFirst({ where: eq(depreciationRuns.id, runId), columns: { journalEntryId: true } });
  if (!run?.journalEntryId) return null;
  return db.query.journalEntries.findFirst({ where: eq(journalEntries.id, run.journalEntryId) });
}
