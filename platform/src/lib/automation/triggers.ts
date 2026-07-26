import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { automationCampaigns, automationEnrollments } from "@/db/schema";
import { enrollBp } from "./engine";

const DAY = 86_400_000;
// Don't re-enroll the same account into the same campaign within this window.
const COOLDOWN_DAYS = 45;

// The four priority (★) campaigns and the SQL that detects accounts entering
// each trigger. Detection only enrolls into ACTIVE campaigns, so nothing fires
// until the team turns a campaign on. Placeholders/thresholds are conservative
// proxies the team can tune.
const RULES: { name: string; candidates: ReturnType<typeof sql> }[] = [
  {
    // Campaign 1 — Financial Approval Stall: a newly added, non-imported account
    // that isn't credit-approved (no credit limit) a few days after creation.
    name: "1. Financial Approval Stall",
    candidates: sql`
      SELECT bp.id::text AS id FROM business_partners bp
      WHERE bp.lifecycle_stage <> 'customer'
        AND bp.legacy_code IS NULL
        AND bp.created_at <= now() - interval '3 days'
        AND bp.created_at >= now() - interval '45 days'
        AND (bp.credit_limit IS NULL OR bp.credit_limit = 0)`,
  },
  {
    // Campaign 2 — Interested, No Meeting Booked: a lead/prospect with no meeting
    // on the calendar a couple of days in.
    name: "2. Interested – No Meeting Booked",
    candidates: sql`
      SELECT bp.id::text AS id FROM business_partners bp
      WHERE bp.lifecycle_stage IN ('lead','prospect')
        AND bp.legacy_code IS NULL
        AND bp.created_at <= now() - interval '2 days'
        AND bp.created_at >= now() - interval '45 days'
        AND NOT EXISTS (SELECT 1 FROM meetings m WHERE m.bp_id = bp.id)`,
  },
  {
    // Campaign 3 — Quoted / Sampled, No First Order: a quote was sent/accepted
    // 5+ days ago and the account has never placed an order.
    name: "3. Quoted / Sampled – No First Order",
    candidates: sql`
      SELECT DISTINCT bp.id::text AS id FROM business_partners bp
      JOIN quotes q ON q.bp_id = bp.id
      WHERE q.status IN ('sent','accepted')
        AND q.updated_at <= now() - interval '5 days'
        AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.bp_id = bp.id)`,
  },
  {
    // Campaign 4 — Dormant / Reorder Lapse: a customer with past orders but none
    // in 90 days and no open quote.
    name: "4. Dormant / Reorder Lapse",
    candidates: sql`
      SELECT bp.id::text AS id FROM business_partners bp
      WHERE bp.lifecycle_stage = 'customer'
        AND EXISTS (SELECT 1 FROM orders o WHERE o.bp_id = bp.id)
        AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.bp_id = bp.id AND o.created_at > now() - interval '90 days')
        AND NOT EXISTS (SELECT 1 FROM quotes q WHERE q.bp_id = bp.id AND q.status IN ('draft','sent'))`,
  },
];

/**
 * Scan for accounts that have entered a priority campaign's trigger and enroll
 * them (respecting a cooldown and the campaign's active flag). Returns counts.
 */
export async function detectAndEnroll(): Promise<{ enrolled: number; byCampaign: Record<string, number> }> {
  let enrolled = 0;
  const byCampaign: Record<string, number> = {};

  for (const rule of RULES) {
    const campaign = await db.query.automationCampaigns.findFirst({ where: eq(automationCampaigns.name, rule.name) });
    if (!campaign || !campaign.active) continue; // only auto-enroll into ACTIVE campaigns

    const res = await db.execute(rule.candidates);
    const rows = (res as unknown as { rows?: { id: string }[] }).rows ?? (res as unknown as { id: string }[]);
    const ids = (rows ?? []).map((r) => r.id).filter(Boolean);

    let n = 0;
    for (const bpId of ids) {
      const recent = await db.query.automationEnrollments.findFirst({
        where: and(
          eq(automationEnrollments.campaignId, campaign.id),
          eq(automationEnrollments.bpId, bpId),
          gte(automationEnrollments.enrolledAt, new Date(Date.now() - COOLDOWN_DAYS * DAY)),
        ),
      });
      if (recent) continue; // cooldown or already enrolled recently
      await enrollBp(bpId, "manual", campaign.id); // enrollBp also skips if an active enrollment exists
      n++;
      enrolled++;
    }
    if (n) byCampaign[rule.name] = n;
  }

  return { enrolled, byCampaign };
}
