import { config } from "dotenv";
config({ path: ".env.local" });
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { automationCampaigns, automationSteps } from "../src/db/schema";

async function main() {
  const name = "New Lead Nurture";
  const existing = await db.query.automationCampaigns.findFirst({ where: eq(automationCampaigns.name, name) });
  if (existing) {
    console.log("= campaign exists:", name);
    process.exit(0);
  }
  const [c] = await db
    .insert(automationCampaigns)
    .values({ name, description: "Default drip for new leads — first contact through follow-ups.", trigger: "lead_created", active: true })
    .returning({ id: automationCampaigns.id });

  const steps = [
    { dayOffset: 0, actionType: "create_task" as const, taskTitle: "Call new lead — introduce G54", dueDays: 1, sortOrder: 0 },
    { dayOffset: 2, actionType: "email_customer" as const, emailSubject: "Great Mountain West — following up", emailBody: "Hi {company},\n\nThanks for your interest in Great Mountain West. We'd love to help with your project — reply here or call us anytime.\n\n— G54", sortOrder: 1 },
    { dayOffset: 5, actionType: "notify_owner" as const, notifyMessage: "Lead follow-up: any response yet?", sortOrder: 2 },
    { dayOffset: 10, actionType: "create_task" as const, taskTitle: "Second follow-up call", dueDays: 0, sortOrder: 3 },
  ];
  await db.insert(automationSteps).values(steps.map((s) => ({ campaignId: c.id, ...s })));
  console.log(`+ seeded campaign "${name}" with ${steps.length} steps`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
