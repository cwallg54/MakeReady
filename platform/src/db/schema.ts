import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  bigserial,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

/**
 * MakeReady — Phase 1 (Platform Foundation) schema.
 * Single-tenant. Every write is expected to also append to `auditLog`
 * (see src/lib/audit.ts) — audit logging cannot be disabled.
 */

// The six MakeReady roles. A user may hold more than one (see requirements/rbac.md).
export const roleEnum = pgEnum("role", [
  "admin",
  "sales_manager",
  "sales_rep",
  "finance",
  "production",
  "art",
]);

export const userStatusEnum = pgEnum("user_status", ["active", "inactive"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  // Null until the user sets a password (invited / forced reset).
  passwordHash: text("password_hash"),
  status: userStatusEnum("status").notNull().default("active"),
  mustResetPassword: boolean("must_reset_password").notNull().default(false),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);

// Server-side session records. JWT carries the session id (jti); a session is
// valid only while its row exists and has not expired — this is how "single
// active session" and "deactivate invalidates sessions immediately" are enforced.
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // We store only a hash of the token; the raw token lives only in the email link.
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("prt_user_id_idx").on(t.userId)],
);

// Single-row system settings (id is always the fixed sentinel below).
export const SYSTEM_SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

export const systemSettings = pgTable("system_settings", {
  id: uuid("id").primaryKey(),
  companyName: text("company_name").notNull().default("Great Mountain West"),
  legalName: text("legal_name"),
  timezone: text("timezone").notNull().default("America/Denver"),
  fiscalYearStartMonth: integer("fiscal_year_start_month").notNull().default(1),
  sessionTimeoutMinutes: integer("session_timeout_minutes").notNull().default(60),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => users.id),
});

// Number series for document numbering (forward-looking; Sales uses these in Phase 2).
export const numberSeries = pgTable("number_series", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentType: text("document_type").notNull().unique(),
  prefix: text("prefix").notNull(),
  nextNumber: integer("next_number").notNull().default(1),
  padding: integer("padding").notNull().default(5),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Append-only audit log. One row per write operation.
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(), // e.g. "auth.login", "user.create", "config.update"
    entityType: text("entity_type"), // e.g. "user", "system_settings"
    entityId: text("entity_id"),
    metadata: jsonb("metadata"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_created_at_idx").on(t.createdAt),
    index("audit_user_id_idx").on(t.userId),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("info"),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_id_idx").on(t.userId)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Role = (typeof roleEnum.enumValues)[number];
export type Notification = typeof notifications.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
