import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "../src/db";
import { meetingTypes } from "../src/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const types = [
    { name: "First Sales Meeting", durationMin: 30, color: "blue", sortOrder: 0, description: "Intro meeting with a new customer." },
    { name: "Discovery Call", durationMin: 45, color: "green", sortOrder: 1, description: "Understand needs and scope a project." },
    { name: "Order Approval Review", durationMin: 30, color: "purple", sortOrder: 2, description: "Review and approve an order before production." },
    { name: "Follow-up", durationMin: 15, color: "amber", sortOrder: 3, description: "Quick check-in." },
  ];
  let added = 0;
  for (const t of types) {
    const exists = await db.query.meetingTypes.findFirst({ where: eq(meetingTypes.name, t.name) });
    if (!exists) { await db.insert(meetingTypes).values(t); added++; }
  }
  console.log(`meeting types ensured (+${added})`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
