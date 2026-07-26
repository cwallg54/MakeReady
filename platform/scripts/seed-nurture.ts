/**
 * Seed the Field Sales Nurturing campaigns from the Nurturing Campaign Playbook.
 * Run:  pnpm exec tsx scripts/seed-nurture.ts
 *
 * Each cadence touch becomes a step: email touches -> email_customer, and
 * call / voicemail / text / in-person / internal touches -> dated rep tasks.
 * Campaigns are seeded INACTIVE with a MANUAL trigger — the engine does not yet
 * auto-detect these lifecycle triggers (credit-incomplete, quoted-no-order,
 * dormant, etc.), so managers/reps enroll accounts, and the team activates each
 * campaign when ready. Idempotent by campaign name.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { automationCampaigns, automationSteps } from "../src/db/schema";

type Touch =
  | { day: number; email: { subject: string; body: string } }
  | { day: number; task: string }
  | { day: number; notify: string };

interface Campaign {
  name: string;
  description: string;
  touches: Touch[];
}

const sig = "\n\n— Great Mountain West";

const CAMPAIGNS: Campaign[] = [
  {
    name: "1. Financial Approval Stall",
    description:
      "Trigger (manual): account added but credit/financial approval not completed. Goal: approved & ready to order (~21 days, 9 touches). Success → enroll in New Account Welcome; release → quarterly drip.",
    touches: [
      { day: 0, task: "Internal: confirm the financial contact (owner/AP), then send the credit app + resale cert/W-9 request. (Goal: app in their hands)" },
      { day: 1, task: "Call + VM: confirm they received the app; offer a 10-min live walkthrough. VM: approval unlocks pricing + reserved capacity. (Goal: live connect)" },
      { day: 2, email: { subject: "3 quick things to open your {company} account", body: "Hi {company},\n\nTo get your account approved and pricing unlocked, we just need three things:\n1) Credit application\n2) Resale certificate\n3) Two trade references\n\nHappy to fill it out together in 10 minutes — just reply and I'll send a time." + sig } },
      { day: 4, task: "Text: send the credit-app link — 'here's that credit app whenever you have 5 min: [link]'. (Goal: easy path)" },
      { day: 6, task: "Call + VM: benefit-led — approval = locked pricing/terms/capacity; offer a prepay or card first order while credit processes. (Goal: urgency + option B)" },
      { day: 9, email: { subject: "Don't let paperwork hold up your first run", body: "Hi {company},\n\nWhile credit is processing, we can start your first order on prepay or a card — so you don't lose your spot in production. Want me to put together a starter order?" + sig } },
      { day: 13, task: "Call the finance/AP contact directly (not just the buyer) to complete the app. (Goal: reach the real blocker)" },
      { day: 16, email: { subject: "Still want to make this easy, {company}", body: "Hi {company},\n\nWe're holding your pricing and a production slot, but seasonal capacity is filling up. Can we finish the quick approval this week?" + sig } },
      { day: 21, email: { subject: "I'll pause here — reach out anytime", body: "Hi {company},\n\nI don't want to crowd your inbox, so I'll pause here. Whenever you're ready to open the account and order, reply to this note and we'll pick right back up." + sig } },
    ],
  },
  {
    name: "2. Interested – No Meeting Booked",
    description:
      "Trigger (manual): expressed order interest but no discovery meeting scheduled. Goal: meeting booked & held (~14 days, 7 touches). Success → Quote/Sample campaign; release → newsletter drip. See the Missed Meeting Recovery campaign for no-shows.",
    touches: [
      { day: 0, email: { subject: "Let's find 15 minutes, {company}", body: "Hi {company},\n\nThanks for your interest! I'd love to scope what you need — quantities, products, timing. Do any of these work: [Tue 10am / Wed 2pm / Thu 9am]? Or grab any time here: [scheduling link].\n\nI'll bring relevant samples." + sig } },
      { day: 1, task: "Call + VM: 'Let's grab 15 minutes to scope your needs — quantities, products, timing.' Reference the slots you emailed. (Goal: live connect)" },
      { day: 3, task: "Text the scheduling link with a one-line nudge. (Goal: frictionless booking)" },
      { day: 5, email: { subject: "I'll bring the samples to you", body: "Hi {company},\n\nHappy to come by with samples and mockups relevant to your business so the meeting's worth your time. What day this week works? Book here: [scheduling link]." + sig } },
      { day: 8, task: "Call at a different time of day, or try a second contact at the account. (Goal: new angle)" },
      { day: 11, email: { subject: "Should I close the loop?", body: "Hi {company},\n\nJust making sure this didn't slip — still worth a quick 15 minutes to scope your project? A yes or no is totally fine. Book anytime: [scheduling link]." + sig } },
      { day: 14, email: { subject: "Closing the loop for now", body: "Hi {company},\n\nI'll pause outreach for now and keep you on our seasonal updates. Whenever timing's better, reply and we'll set that meeting." + sig } },
    ],
  },
  {
    name: "2b. Missed Meeting Recovery",
    description:
      "Trigger (manual): a booked meeting was a no-show. Same-day momentum matters — run this short recovery, then rejoin Campaign 2 at ~Day 8 if still no response.",
    touches: [
      { day: 0, task: "Text + call: 'Sorry we missed each other — a few minutes now or later today?' Assume good intent, no guilt. (Goal: rebook immediately)" },
      { day: 0, email: { subject: "Sorry we missed each other", body: "Hi {company},\n\nNo problem at all — let's grab a few minutes today or tomorrow. Here's what I'd planned to cover: your needs, timing, and pricing. Two quick options: [Today 3pm / Tomorrow 10am], or book here: [scheduling link]." + sig } },
      { day: 1, task: "Call + VM: second live attempt; offer a quick phone version instead of a full meeting. (Goal: salvage the conversation)" },
      { day: 3, email: { subject: "One more time that works?", body: "Hi {company},\n\nHappy to do a quick phone version instead of a full meeting if that's easier. Grab any time here: [scheduling link], or reply with what works." + sig } },
    ],
  },
  {
    name: "3. Quoted / Sampled – No First Order",
    description:
      "Trigger (manual): quote sent or sample delivered, no PO within ~5 days. Goal: first order placed (~21 days, 8 touches). Success → Welcome; release → capture lost reason + seasonal drip.",
    touches: [
      { day: 0, email: { subject: "Your quote from Great Mountain West", body: "Hi {company},\n\nWanted to make sure your quote/sample arrived. Quick recap of what you're getting: decoration method, minimums, turnaround, and your pricing tier. Any questions on any of it?" + sig } },
      { day: 2, task: "Call + VM: 'What did you think of the sample? Any questions on pricing or turnaround?' Listen for the real objection. (Goal: surface objections)" },
      { day: 4, email: { subject: "Making your first order easy", body: "Hi {company},\n\nA few things that trip people up on a first run — artwork/setup, minimums, lead time. I can pre-build a mock order so you just approve it. Want me to put one together?" + sig } },
      { day: 7, task: "In-person / sample: drop by or ship a second targeted sample — ideally their logo on the actual product. (Goal: make it real)" },
      { day: 10, task: "Call — trial close: 'Want me to lock in this pricing and reserve a production slot?' Ask for the order. (Goal: advance to PO)" },
      { day: 14, email: { subject: "A reason to lock it in this week", body: "Hi {company},\n\nIf it helps you move now, I can include free setup on your first run and hold this pricing through [date]. Want me to reserve a production slot?" + sig } },
      { day: 18, task: "Call the decision maker if you've been working through a gatekeeper. (Goal: reach authority)" },
      { day: 21, email: { subject: "Pausing — but keeping your pricing on file", body: "Hi {company},\n\nI'll pause here so I'm not crowding you. Your quote and pricing are on file — reply anytime and we'll pick it up. Mind sharing what held it up so I can help better next time?" + sig } },
    ],
  },
  {
    name: "4. Dormant / Reorder Lapse",
    description:
      "Trigger (manual): no order past the account's normal reorder interval (set per account) with no open opp. Goal: reorder placed (~30 days, 7 touches). Success → normal management; release → newsletter + log churn reason.",
    touches: [
      { day: 0, email: { subject: "We miss you, {company} — easy reorder inside", body: "Hi {company},\n\nIt's been a while! I can tee up a quick reorder of your last run so it's basically one click. Want me to send it over to approve?" + sig } },
      { day: 2, task: "Call + VM: warm check-in — how's inventory, anything coming up they'll need product for? Relationship first. (Goal: re-open dialogue)" },
      { day: 5, task: "Text: 'Need a restock before [upcoming season/event]?' with a quick link. (Goal: timely nudge)" },
      { day: 9, email: { subject: "A little something to come back", body: "Hi {company},\n\nTo make the reorder easy, I can add free freight on your next run — or show you a new product line I think fits your business. Which sounds better?" + sig } },
      { day: 14, task: "In-person / sample: field visit or drop a new catalog + fresh samples. (Goal: reconnect in person)" },
      { day: 20, task: "Call: 'What changed?' Ask directly; listen for a service issue or a competitor. This is the save-and-recover conversation. (Goal: diagnose & save)" },
      { day: 30, email: { subject: "Always here when you need us", body: "Hi {company},\n\nI'll ease off for now and keep you on our updates. If anything comes up — a rush job, a new season, a reorder — just reply and we'll jump on it." + sig } },
    ],
  },
  {
    name: "5. New Account Welcome & First-Order Fast-Track",
    description:
      "Trigger (manual): credit approved / account activated, no first order yet. Goal: first order within 14 days (~14 days, 7 touches). Speed-to-first-order predicts retention. Release → Quote/Sample logic.",
    touches: [
      { day: 0, email: { subject: "Welcome to Great Mountain West, {company}!", body: "Hi {company},\n\nWelcome aboard! Here's how to order, our line sheet, and quick art-submission guidelines so your first run goes smoothly. Your account team is me + inside sales — reply anytime." + sig } },
      { day: 1, task: "Welcome call: learn near-term needs; propose a starter order or a sample pack. (Goal: identify first need)" },
      { day: 3, email: { subject: "Top picks for {company}", body: "Hi {company},\n\nA short, curated set to make your first order easy — decorated tees, caps, and drinkware that fit your business. Want me to build a starter order from these?" + sig } },
      { day: 6, task: "In-person / sample: sample-pack drop-off or a visit to review products in person. (Goal: build confidence)" },
      { day: 9, task: "Call: build the first order together — quantities, sizes, decoration, in-hands date. (Goal: assemble the PO)" },
      { day: 12, email: { subject: "Free setup on your first run", body: "Hi {company},\n\nTo get your first order rolling, I'll cover setup/decoration on the opening run. Tell me quantities and your in-hands date and I'll lock it in." + sig } },
      { day: 14, task: "Call: close the first order; set expectations for proof, production, and delivery. (Goal: first PO placed)" },
    ],
  },
  {
    name: "6. Seasonal / Event-Driven Reorder Push",
    description:
      "Trigger (manual, time-based): ~8–10 weeks before a known season/event, applied to active + recently lapsed accounts. Goal: seasonal order + booked capacity (3–4 week push, 6 touches). Day offsets count from the Week -8 kickoff.",
    touches: [
      { day: 0, email: { subject: "Plan ahead for [season] — lookbook + deadlines", body: "Hi {company},\n\n[Season] is coming. Here's a lookbook and the key dates — art-due and order-by — to guarantee in-hands delivery. Want to plan this season's order together?" + sig } },
      { day: 7, task: "Call: plan the season together — quantities, products, artwork refresh. (Goal: scope the order)" },
      { day: 14, task: "In-person / sample: bring seasonal item samples relevant to their audience. (Goal: inspire the order)" },
      { day: 21, email: { subject: "Early-bird pricing — order by [date]", body: "Hi {company},\n\nOrders placed by [date] lock early-bird pricing and a reserved production slot before the crunch. Want me to hold capacity for {company}?" + sig } },
      { day: 28, task: "Call: confirm and place the PO; lock the production slot. (Goal: book capacity)" },
      { day: 35, email: { subject: "Last call to hit [event] in time", body: "Hi {company},\n\nThe final order-by date to guarantee on-time delivery for [event] is [date]. Want me to place your order now so you're covered?" + sig } },
    ],
  },
  {
    name: "7. At-Risk / Churn Rescue",
    description:
      "Trigger (manual): declining frequency/value, a service complaint, or a key contact departure. Goal: diagnose the risk and secure a retention commitment (~21 days, 6 touches). Lead with service, not discount.",
    touches: [
      { day: 0, task: "Call — proactive, no-pitch check-in: 'How are we doing? Anything we could be doing better?' Listen for the real issue. (Goal: open honestly)" },
      { day: 1, email: { subject: "Thanks for the honest feedback", body: "Hi {company},\n\nThanks for talking today. I heard you on the issue you raised and want to make it right. Could we do a short business review — I'll bring your order history and a couple of ideas?" + sig } },
      { day: 4, task: "In-person / sample: on-site business review — bring order history, savings to date, and relevant new products. (Goal: re-establish value)" },
      { day: 8, email: { subject: "A plan built around {company}", body: "Hi {company},\n\nBased on what you shared, here's a proposal to address it — pricing, a service SLA, or a dedicated contact. Want to talk it through this week?" + sig } },
      { day: 14, task: "Call: manager/senior touch for high-value accounts — exec-to-exec reassurance. (Goal: elevate commitment)" },
      { day: 21, task: "Internal: decide — retention plan with next order booked, or a documented managed exit. (Goal: resolve the account)" },
    ],
  },
];

async function main() {
  let created = 0;
  for (const c of CAMPAIGNS) {
    const existing = await db.query.automationCampaigns.findFirst({ where: eq(automationCampaigns.name, c.name) });
    if (existing) {
      console.log("= exists:", c.name);
      continue;
    }
    const [row] = await db
      .insert(automationCampaigns)
      .values({ name: c.name, description: c.description, trigger: "manual", active: false })
      .returning({ id: automationCampaigns.id });

    const steps = c.touches.map((t, i) => {
      const base = { campaignId: row.id, dayOffset: t.day, sortOrder: i };
      if ("email" in t) return { ...base, actionType: "email_customer" as const, emailSubject: t.email.subject, emailBody: t.email.body };
      if ("notify" in t) return { ...base, actionType: "notify_owner" as const, notifyMessage: t.notify };
      return { ...base, actionType: "create_task" as const, taskTitle: t.task, dueDays: 1 };
    });
    await db.insert(automationSteps).values(steps);
    created++;
    console.log(`+ seeded "${c.name}" (${steps.length} touches)`);
  }
  console.log(`Nurture seed complete — ${created} new campaign(s), ${CAMPAIGNS.length - created} already present.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
