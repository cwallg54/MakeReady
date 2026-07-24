import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import {
  users,
  userRoles,
  systemSettings,
  numberSeries,
  accountGroups,
  SYSTEM_SETTINGS_ID,
} from "../src/db/schema";
import { hashPassword } from "../src/lib/auth/password";

/**
 * Idempotent seed: system settings, an initial Admin, and default number series.
 * Set SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD / SEED_ADMIN_NAME to control the admin.
 * If no password is supplied, a strong temporary one is generated and printed once.
 */
async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@g54.com").toLowerCase();
  const name = process.env.SEED_ADMIN_NAME ?? "Christopher Wall";
  const providedPassword = process.env.SEED_ADMIN_PASSWORD;
  const tempPassword = providedPassword ?? `Mr-${randomBytes(9).toString("base64url")}1A`;

  // System settings (single row).
  await db
    .insert(systemSettings)
    .values({ id: SYSTEM_SETTINGS_ID })
    .onConflictDoNothing();
  console.log("✓ System settings ensured");

  // Default document number series.
  const series = [
    { documentType: "business_partner", prefix: "BP-" },
    { documentType: "quote", prefix: "QUO-" },
    { documentType: "sales_order", prefix: "SO-" },
    { documentType: "delivery", prefix: "DEL-" },
    { documentType: "ar_invoice", prefix: "INV-" },
    { documentType: "incoming_payment", prefix: "PAY-" },
  ];
  for (const s of series) {
    await db.insert(numberSeries).values(s).onConflictDoNothing();
  }
  console.log(`✓ Number series ensured (${series.length})`);

  // Default account groups (examples per requirements; adjust in Administration).
  const groups = [
    { code: "STANDARD", name: "Standard" },
    { code: "WHOLESALE", name: "Wholesale" },
    { code: "GOVERNMENT", name: "Government" },
    { code: "VIP", name: "VIP" },
  ];
  for (const g of groups) {
    await db.insert(accountGroups).values(g).onConflictDoNothing();
  }
  console.log(`✓ Account groups ensured (${groups.length})`);

  // Initial admin.
  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) {
    console.log(`✓ Admin already exists: ${email}`);
  } else {
    const passwordHash = await hashPassword(tempPassword);
    const [admin] = await db
      .insert(users)
      .values({ email, name, passwordHash, mustResetPassword: true })
      .returning({ id: users.id });
    await db.insert(userRoles).values({ userId: admin.id, role: "admin" });
    console.log(`✓ Admin created: ${email}`);
    if (!providedPassword) {
      console.log("\n──────────────────────────────────────────────");
      console.log("  Temporary admin password (change on first login):");
      console.log(`  ${tempPassword}`);
      console.log("──────────────────────────────────────────────\n");
    }
  }

  console.log("Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
