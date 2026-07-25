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
  bigint,
  numeric,
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
  // True once the user has at least one confirmed second factor.
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
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
  // Org-wide policy: require every active user to enroll a second factor.
  requireMfa: boolean("require_mfa").notNull().default(false),
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

// ---- CRM (Phase 2) --------------------------------------------------------
// Mirrors the legacy ERP customer model (business partners, contacts,
// addresses, groups) with clean names. `legacyCode` retains the source
// system's key for migration reconciliation; it is never surfaced in the UI.

export const webStoreStatusEnum = pgEnum("web_store_status", [
  "not_published",
  "pending",
  "published",
]);

export const activityTypeEnum = pgEnum("activity_type", [
  "note",
  "call",
  "email",
  "visit",
  "other",
]);

// Sales lifecycle stage for a Business Partner (lead-collection → customer).
export const lifecycleStageEnum = pgEnum("lifecycle_stage", [
  "lead",
  "prospect",
  "customer",
]);

export const addressTypeEnum = pgEnum("address_type", ["billing", "shipping", "other"]);
export const taskStatusEnum = pgEnum("task_status", ["open", "done"]);
export const quoteStatusEnum = pgEnum("quote_status", ["draft", "sent", "accepted", "rejected", "converted"]);
export const automationTriggerEnum = pgEnum("automation_trigger", ["lead_created", "manual"]);
export const automationActionEnum = pgEnum("automation_action", ["create_task", "notify_owner", "email_customer"]);
export const enrollmentStatusEnum = pgEnum("enrollment_status", ["active", "completed", "stopped"]);

export const accountGroups = pgTable("account_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const businessPartners = pgTable(
  "business_partners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bpNumber: text("bp_number").notNull().unique(),
    companyName: text("company_name").notNull(),
    lifecycleStage: lifecycleStageEnum("lifecycle_stage").notNull().default("lead"),
    leadSource: text("lead_source"),
    // Sales rep who owns the account (record-level scoping for the Sales Rep role).
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    tags: text("tags").array(),
    accountGroupId: uuid("account_group_id").references(() => accountGroups.id),
    phone: text("phone"),
    email: text("email"),
    addressStreet: text("address_street"),
    addressCity: text("address_city"),
    addressState: text("address_state"),
    addressZip: text("address_zip"),
    addressCountry: text("address_country"),
    // Finance-sensitive; hidden from the Sales Rep role in the UI.
    creditLimit: numeric("credit_limit", { precision: 14, scale: 2 }),
    accountBalance: numeric("account_balance", { precision: 14, scale: 2 }),
    paymentTerms: text("payment_terms"),
    internalNotes: text("internal_notes"),
    webStoreStatus: webStoreStatusEnum("web_store_status").notNull().default("not_published"),
    // Original key from the legacy ERP (migration reconciliation only).
    legacyCode: text("legacy_code").unique(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("bp_company_name_idx").on(t.companyName)],
);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bpId: uuid("bp_id")
      .notNull()
      .references(() => businessPartners.id, { onDelete: "cascade" }),
    firstName: text("first_name"),
    lastName: text("last_name"),
    title: text("title"),
    email: text("email"),
    phone: text("phone"),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("contacts_bp_id_idx").on(t.bpId)],
);

// Immutable activity log per business partner (notes, calls, emails, visits).
export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bpId: uuid("bp_id")
      .notNull()
      .references(() => businessPartners.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    type: activityTypeEnum("type").notNull().default("note"),
    content: text("content").notNull(),
    // System-generated entries (record changes) vs. user-logged notes/calls/etc.
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activities_bp_id_idx").on(t.bpId)],
);

// Multiple addresses per BP (bill-to / ship-to), mirroring the legacy CRD1 model.
export const bpAddresses = pgTable(
  "bp_addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bpId: uuid("bp_id")
      .notNull()
      .references(() => businessPartners.id, { onDelete: "cascade" }),
    type: addressTypeEnum("type").notNull().default("shipping"),
    label: text("label"),
    street: text("street"),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    country: text("country"),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("bp_addresses_bp_id_idx").on(t.bpId)],
);

// Sales follow-up tasks against a BP.
export const crmTasks = pgTable(
  "crm_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bpId: uuid("bp_id")
      .notNull()
      .references(() => businessPartners.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }),
    status: taskStatusEnum("status").notNull().default("open"),
    assignedToId: uuid("assigned_to_id").references(() => users.id, { onDelete: "set null" }),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_tasks_bp_id_idx").on(t.bpId), index("crm_tasks_assigned_idx").on(t.assignedToId)],
);

// ---- MFA ------------------------------------------------------------------

// One TOTP authenticator secret per user (confirmed once a valid code is entered).
export const mfaTotp = pgTable("mfa_totp", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  secret: text("secret").notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// FIDO2 / WebAuthn credentials (passkeys, security keys).
export const webauthnCredentials = pgTable(
  "webauthn_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    credentialId: text("credential_id").notNull().unique(), // base64url
    publicKey: text("public_key").notNull(), // base64url
    counter: bigint("counter", { mode: "number" }).notNull().default(0),
    transports: text("transports").array(),
    deviceName: text("device_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [index("webauthn_user_id_idx").on(t.userId)],
);

// One-time recovery codes (stored hashed).
export const recoveryCodes = pgTable(
  "recovery_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("recovery_codes_user_id_idx").on(t.userId)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Role = (typeof roleEnum.enumValues)[number];
export type Notification = typeof notifications.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
export type BusinessPartner = typeof businessPartners.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type AccountGroup = typeof accountGroups.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type BpAddress = typeof bpAddresses.$inferSelect;
export type CrmTask = typeof crmTasks.$inferSelect;

// ---- Order-form / Quote engine (Sales, Phase 2) ---------------------------
// One configurable engine drives all product order forms. Each product type is
// an order_form_template with a catalog (template_items) and typed charge rules.

// A charge rule stored in template.charges (jsonb):
// { key, label, type: "flat"|"per_unit"|"per_color"|"per_hour"|"percent",
//   rate: number, unit?: string, appliesWhen?: "always"|"new"|"reorder" }
export const orderFormTemplates = pgTable("order_form_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  // Optional apparel size/variant labels (e.g. ["S","M","L","XL"]); null = no matrix.
  sizeOptions: text("size_options").array(),
  // Default markup % applied over supplier cost when an item has no own markup.
  defaultMarkupPct: numeric("default_markup_pct", { precision: 6, scale: 2 }).notNull().default("0"),
  charges: jsonb("charges"), // ChargeRule[]
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const templateItems = pgTable(
  "template_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => orderFormTemplates.id, { onDelete: "cascade" }),
    code: text("code"),
    name: text("name").notNull(),
    // Supplier cost (entered manually now; vendor-integrated later).
    supplierCost: numeric("supplier_cost", { precision: 12, scale: 2 }).notNull().default("0"),
    // Per-item markup % override; null = use the template's default markup.
    markupPct: numeric("markup_pct", { precision: 6, scale: 2 }),
    // Effective sell price = supplierCost * (1 + markup/100), computed on save.
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull().default("0"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("template_items_template_id_idx").on(t.templateId)],
);

export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteNumber: text("quote_number").notNull().unique(),
    bpId: uuid("bp_id").references(() => businessPartners.id, { onDelete: "set null" }),
    templateId: uuid("template_id").references(() => orderFormTemplates.id),
    status: quoteStatusEnum("status").notNull().default("draft"),
    isReorder: boolean("is_reorder").notNull().default(false),
    discount: numeric("discount", { precision: 12, scale: 2 }).notNull().default("0"),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
    chargesTotal: numeric("charges_total", { precision: 12, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("quotes_bp_id_idx").on(t.bpId)],
);

export const quoteLines = pgTable(
  "quote_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    itemCode: text("item_code"),
    description: text("description").notNull(),
    qty: integer("qty").notNull().default(0),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull().default("0"),
    extended: numeric("extended", { precision: 12, scale: 2 }).notNull().default("0"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("quote_lines_quote_id_idx").on(t.quoteId)],
);

export const quoteCharges = pgTable(
  "quote_charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: text("type").notNull(),
    rate: numeric("rate", { precision: 12, scale: 2 }).notNull().default("0"),
    inputQty: numeric("input_qty", { precision: 12, scale: 2 }).notNull().default("1"),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  },
  (t) => [index("quote_charges_quote_id_idx").on(t.quoteId)],
);

// ---- Sales automation / drip campaigns ------------------------------------
// A campaign is a timed sequence of steps. Enroll a Business Partner (lead) and
// a daily scheduler fires each step when due (create task, notify, email).

export const automationCampaigns = pgTable("automation_campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  trigger: automationTriggerEnum("trigger").notNull().default("manual"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const automationSteps = pgTable(
  "automation_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => automationCampaigns.id, { onDelete: "cascade" }),
    dayOffset: integer("day_offset").notNull().default(0), // days after enrollment
    actionType: automationActionEnum("action_type").notNull(),
    taskTitle: text("task_title"),
    dueDays: integer("due_days").notNull().default(0), // for create_task
    notifyMessage: text("notify_message"),
    emailSubject: text("email_subject"),
    emailBody: text("email_body"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("automation_steps_campaign_idx").on(t.campaignId)],
);

export const automationEnrollments = pgTable(
  "automation_enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => automationCampaigns.id, { onDelete: "cascade" }),
    bpId: uuid("bp_id")
      .notNull()
      .references(() => businessPartners.id, { onDelete: "cascade" }),
    status: enrollmentStatusEnum("status").notNull().default("active"),
    nextStepIndex: integer("next_step_index").notNull().default(0),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("automation_enrollments_due_idx").on(t.status, t.nextRunAt)],
);

export type OrderFormTemplate = typeof orderFormTemplates.$inferSelect;
export type TemplateItem = typeof templateItems.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
export type QuoteLine = typeof quoteLines.$inferSelect;
export type QuoteCharge = typeof quoteCharges.$inferSelect;
export type AutomationCampaign = typeof automationCampaigns.$inferSelect;
export type AutomationStep = typeof automationSteps.$inferSelect;
export type AutomationEnrollment = typeof automationEnrollments.$inferSelect;
