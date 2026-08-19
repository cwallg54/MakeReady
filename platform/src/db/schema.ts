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
  uniqueIndex,
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
  // Mobile number for SMS alerts (opt-in; used when SMS is configured).
  phone: text("phone"),
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
  // Credit approval tier: finance may approve over-limit orders up to this much
  // over the limit; anything above requires an Admin/manager.
  creditApprovalThreshold: numeric("credit_approval_threshold", { precision: 14, scale: 2 }).notNull().default("5000"),
  // GL period close: journal entries dated on/before this date are locked — they
  // can't be created-as-posted, posted, or voided. Null = books fully open.
  glClosingDate: timestamp("gl_closing_date", { withTimezone: true }),
  glClosingNote: text("gl_closing_note"),
  // Default sales-tax rate applied to new invoices (e.g. 0.0725 = 7.25%).
  defaultTaxRate: numeric("default_tax_rate", { precision: 6, scale: 4 }).notNull().default("0"),
  // Processing fee added when a customer pays an invoice by card (e.g. 3.00 =
  // +3%). Bank/ACH payments never carry the fee. 0 disables the surcharge.
  cardSurchargePct: numeric("card_surcharge_pct", { precision: 6, scale: 3 }).notNull().default("3"),
  // Max discount a Sales Rep can apply to a quote (% of subtotal); it comes out
  // of their commission. Managers/Admins are uncapped. 0 = reps can't discount.
  repDiscountCapPct: numeric("rep_discount_cap_pct", { precision: 6, scale: 3 }).notNull().default("2"),
  // AR late fee: % of the overdue balance applied once when an invoice is this
  // many days past due. 0% disables late fees.
  lateFeePct: numeric("late_fee_pct", { precision: 6, scale: 3 }).notNull().default("1.5"),
  lateFeeDays: integer("late_fee_days").notNull().default(15),
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

// Teams / groups for routing work and alerts to a set of people (e.g. Purchasing,
// Production) instead of a single person — gives coverage, visibility, and
// reporting. Notifications route to a team's members, with a role fallback when
// the team has no members yet.
export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(), // stable slug used in code, e.g. "purchasing"
  name: text("name").notNull(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const teamMembers = pgTable(
  "team_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("team_members_team_user_uk").on(t.teamId, t.userId), index("team_members_user_idx").on(t.userId)],
);
export type Team = typeof teams.$inferSelect;

// ---- CRM (Phase 2) --------------------------------------------------------
// Mirrors the legacy ERP customer model (business partners, contacts,
// addresses, groups) with clean names. `legacyCode` retains the source
// system's key for migration reconciliation; it is never surfaced in the UI.

export const webStoreStatusEnum = pgEnum("web_store_status", [
  "not_published",
  "pending",
  "published",
]);

// Which storefront audience can see a product: the public shop, the B2B
// (logged-in Business Partner) portal, or both.
export const storeVisibilityEnum = pgEnum("store_visibility", ["public", "b2b", "both"]);

// Storefront customer account lifecycle. Self-registered customers start
// `pending` and can't order until an admin approves them to `active`.
export const storeCustomerStatusEnum = pgEnum("store_customer_status", ["pending", "active", "suspended", "rejected"]);

// Store order lifecycle (on-account / request model — no online payment yet).
export const storeOrderStatusEnum = pgEnum("store_order_status", ["pending", "confirmed", "fulfilled", "canceled"]);

// Promo code discount type.
export const storePromoKindEnum = pgEnum("store_promo_kind", ["percent", "fixed"]);

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
export const orderStageEnum = pgEnum("order_stage", ["received", "art_proof", "production", "quality", "shipped", "delivered"]);
export const proofStatusEnum = pgEnum("proof_status", ["pending", "approved", "changes_requested", "declined", "meeting_requested"]);
// Art-request pipeline stages — these are the columns of the Art department Kanban.
export const artStatusEnum = pgEnum("art_status", ["todo", "in_progress", "proofing", "revisions", "approved", "done"]);
// Sales-controlled art priority: one P1 and one P2 per salesperson.
export const artPriorityEnum = pgEnum("art_priority", ["none", "p2", "p1"]);
// The production route an art job is headed for (drives type-specific fields).
export const artProductionTypeEnum = pgEnum("art_production_type", ["screen_print", "embroidery", "headwear", "hard_goods", "other"]);
// Production-job pipeline stages — the columns of the Production Kanban.
export const productionStatusEnum = pgEnum("production_status", ["queued", "in_production", "quality_check", "ready_to_ship", "shipped"]);
// First-article "press check": Production runs one item, photographs it, and Art
// signs off before the full run is released. One row per attempt.
export const pressCheckStatusEnum = pgEnum("press_check_status", ["pending", "approved", "rejected"]);
// Stock movement reasons for the inventory ledger.
export const stockReasonEnum = pgEnum("stock_reason", ["receive", "consume", "adjust", "count", "transfer"]);
export const customerDocTypeEnum = pgEnum("customer_doc_type", ["terms_application", "credit_card_application"]);
// Finance-only document vault categories on a business partner.
export const customerAttachmentKindEnum = pgEnum("customer_attachment_kind", [
  "experian",
  "tax_exempt",
  "credit_app",
  "address_change",
  "credit_increase",
  "other",
]);
export const customerDocStatusEnum = pgEnum("customer_doc_status", ["pending", "completed"]);
export const meetingStatusEnum = pgEnum("meeting_status", ["scheduled", "canceled", "completed"]);
// AR invoice lifecycle: draft -> sent -> (partial ->) paid, or void.
export const invoiceStatusEnum = pgEnum("invoice_status", ["draft", "sent", "partial", "paid", "void"]);
export const paymentMethodEnum = pgEnum("payment_method", ["check", "ach", "card", "cash", "credit", "other"]);
// General ledger: the five fundamental account types. Asset & expense accounts
// are debit-normal; liability, equity & revenue are credit-normal.
export const glAccountTypeEnum = pgEnum("gl_account_type", ["asset", "liability", "equity", "revenue", "expense"]);
export const journalStatusEnum = pgEnum("journal_status", ["draft", "posted", "void"]);
export const creditRequestReasonEnum = pgEnum("credit_request_reason", ["hold", "over_limit"]);
export const creditRequestStatusEnum = pgEnum("credit_request_status", ["pending", "approved", "denied"]);
// Design-library (barcode book) statuses. A design item isn't orderable until
// it's active (which requires an item number + barcode and creates the item).
export const designItemStatusEnum = pgEnum("design_item_status", ["draft", "active", "retired"]);

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
    // Sales-territory the account belongs to (mirrors the legacy ERP territory).
    // Used to group the Open Orders reports below the salesperson level.
    territory: text("territory"),
    // Credit-management fields surfaced on the Customer Credit Report (CCR).
    creditHold: boolean("credit_hold").notNull().default(false),
    creditHoldReason: text("credit_hold_reason"),
    personalGuarantee: boolean("personal_guarantee").notNull().default(false),
    priceList: text("price_list"),
    softgoodPriceLevel: text("softgood_price_level"),
    shippingType: text("shipping_type"),
    customerSince: timestamp("customer_since", { withTimezone: true }),
    // Legacy ERP "Parent Number" for grouped/child accounts (reference only).
    parentBpNumber: text("parent_bp_number"),
    // Average Pay Age (days) — trailing-12-month and trailing-24-month.
    historicalApa: integer("historical_apa"),
    twoYearApa: integer("two_year_apa"),
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

// Fixed-window rate limiter for sensitive endpoints (login, password reset,
// MFA verification). One row per (bucket:identifier); reset when the window rolls.
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
});

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
    // Also serves as the base/fallback price when priceBreaks don't apply.
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull().default("0"),
    // Quantity price-break bands: [{minQty, unitPrice}] ascending. When present,
    // the effective unit price is chosen by the order quantity (e.g. caps priced
    // 72/144/288/432/576). Overrides unitPrice for the matched band.
    priceBreaks: jsonb("price_breaks"), // PriceBreak[] | null
    // Minimum order quantity for this item (0 = no minimum).
    minQty: integer("min_qty").notNull().default(0),
    // Per-size upcharge added to the unit price, keyed by size label from the
    // template's sizeOptions (e.g. { "2XL": 2, "3XL": 3 }).
    sizeUpcharges: jsonb("size_upcharges"), // Record<string, number> | null
    // Catalogue image (base64) — shown in the Quote Builder and carried into the
    // order so the art department sees exactly what the customer picked.
    imageBase64: text("image_base64"),
    imageMimeType: text("image_mime_type"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("template_items_template_id_idx").on(t.templateId)],
);

// ---- Product catalog & decoration pricing ---------------------------------
// Admin-managed reference data that powers the full quoting calculator: a blank
// garment catalog (style -> color) plus the decoration methods, print
// locations, color tiers, size classes, and embroidery tiers that drive
// screen-print / apparel pricing. Codes (not ids) are referenced from quote
// lines so they stay stable and human-readable.

// A decoration method (Silk Screen, DTF, Foil, Softhand, Embroidery). `pricing`
// holds the method's rate config (see DecorationPricing in lib/sales/pricing).
export const decorationMethods = pgTable("decoration_methods", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  // "per_color" (screen/DTF/etc.) or "stitch" (embroidery, priced by tier).
  priceMode: text("price_mode").notNull().default("per_color"),
  pricing: jsonb("pricing"), // DecorationPricing
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

// A numbered print/decoration placement (Full Front, Left Chest, Sleeve, ...).
export const printLocations = pgTable("print_locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Garment color tier (white / light / dark) — dark garments take an underbase
// upcharge on silk-screen (see decoration_methods.pricing.darkUpchargePerUnit).
export const colorTiers = pgTable("color_tiers", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

// Embroidery price tier by stitch count (A/B/C/LC): applies when a decoration's
// method is priced "stitch". `maxStitches` bounds the tier; `pricePerUnit` is
// the per-garment run price.
export const embroideryTiers = pgTable("embroidery_tiers", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  maxStitches: integer("max_stitches").notNull().default(0),
  pricePerUnit: numeric("price_per_unit", { precision: 12, scale: 2 }).notNull().default("0"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

// A garment size class (Youth, Adult, Ladies, ...). `sizes` is an ordered list
// of { size, upcharge } added to a style's base price for that size.
export const sizeClasses = pgTable("size_classes", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  sizes: jsonb("sizes"), // { size: string; upcharge: number }[]
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

// A blank garment style (Gildan 5000, Bella+Canvas 3001, ...). `basePrice` is
// GMW's fixed sell base (Adult standard); size upcharges come from the size
// class. supplierCost is optional and used only for margin display.
export const catalogStyles = pgTable(
  "catalog_styles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brand: text("brand"),
    styleNumber: text("style_number"),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category"),
    sizeClassCode: text("size_class_code"), // references color/size class by code
    basePrice: numeric("base_price", { precision: 12, scale: 2 }).notNull().default("0"),
    supplierCost: numeric("supplier_cost", { precision: 12, scale: 2 }),
    imageBase64: text("image_base64"),
    imageMimeType: text("image_mime_type"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("catalog_styles_name_idx").on(t.name)],
);

// A color offered for a style, tagged to a color tier (drives underbase).
export const catalogColors = pgTable(
  "catalog_colors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    styleId: uuid("style_id")
      .notNull()
      .references(() => catalogStyles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tierCode: text("tier_code"), // references color_tiers.code
    hex: text("hex"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("catalog_colors_style_id_idx").on(t.styleId)],
);

// ---- Design library (the "barcode book") ----------------------------------
// Art's design-number system: brands (G54 / ESM), product/location suffixes,
// reusable base designs, and the concrete design items (SKUs) generated from
// them. Creating an active design item auto-creates the inventory item + image.

export const designBrands = pgTable("design_brands", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(), // G54, ESM
  name: text("name").notNull(),
  // ESM is legacy — new designs default to G54 and picking ESM is an exception.
  isLegacy: boolean("is_legacy").notNull().default(false),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const designSuffixes = pgTable("design_suffixes", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(), // T, HD, PA, KZ, PE, LC, LS, FF...
  label: text("label").notNull(),
  kind: text("kind").notNull().default("product"), // product | location | hardgood
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

// A reusable base design (e.g. 4428 "Summer Bloom"). Can be applied to many
// customers/products via design items.
export const baseDesigns = pgTable(
  "base_designs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    baseNumber: text("base_number").notNull().unique(),
    name: text("name").notNull(),
    brandCode: text("brand_code").notNull().default("G54"),
    releaseYear: integer("release_year"),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("base_designs_name_idx").on(t.name)],
);

// A concrete SKU generated from a base design: brand + optional customer +
// product/location suffix + color variant, with the art image and a barcode.
export const designItems = pgTable(
  "design_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Full Design # = {custNumber}-{designBase}[-suffix][-variant]. Not unique:
    // imported historical rows (esp. archives) can repeat.
    itemNumber: text("item_number").notNull(),
    baseDesignId: uuid("base_design_id").references(() => baseDesigns.id, { onDelete: "set null" }),
    // Real barcode-book fields.
    custNumber: text("cust_number"), // customer number without leading "C" (or NEW)
    designBase: text("design_base"), // artwork base id (4015, AR118237, SS4008, ESM100, OSH2600)
    description: text("description"),
    catalog: text("catalog").notNull().default("g54"), // g54|esm|emb|patch|osh|wood|stain|royalty|archive
    brandCode: text("brand_code").notNull().default("G54"),
    bpId: uuid("bp_id").references(() => businessPartners.id, { onDelete: "set null" }),
    suffix: text("suffix"),
    colorVariant: text("color_variant"),
    printing: text("printing"),
    royalty: text("royalty"),
    location: text("location"),
    salesperson: text("salesperson"),
    assigneeInitials: text("assignee_initials"),
    stitchCount: integer("stitch_count"),
    source: text("source"),
    setup: text("setup"), // "Set Up in SAP" status from the book
    barcodeNumber: text("barcode_number"),
    barcodeSource: text("barcode_source").notNull().default("gmw"), // gmw | customer
    imageBase64: text("image_base64"),
    imageMimeType: text("image_mime_type"),
    status: designItemStatusEnum("status").notNull().default("draft"),
    isException: boolean("is_exception").notNull().default(false),
    exceptionReason: text("exception_reason"),
    // Imported archive rows are flagged so they can be filtered out of the live view.
    archived: boolean("archived").notNull().default(false),
    archiveTag: text("archive_tag"),
    inventoryItemId: uuid("inventory_item_id").references(() => inventoryItems.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("design_items_base_idx").on(t.baseDesignId),
    index("design_items_bp_idx").on(t.bpId),
    index("design_items_number_idx").on(t.itemNumber),
    index("design_items_catalog_idx").on(t.catalog),
  ],
);

// Barcodes from the book's barcode tabs — 12/10-digit UPC or customer-provided,
// at garment/color/size granularity, linked to a design number.
export const designBarcodes = pgTable(
  "design_barcodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    designItemId: uuid("design_item_id").references(() => designItems.id, { onDelete: "set null" }),
    designNumber: text("design_number"), // the design # this barcode is for (match key)
    barcode12: text("barcode_12"),
    barcode10: text("barcode_10"),
    description: text("description"),
    custNumber: text("cust_number"),
    custItemNumber: text("cust_item_number"),
    customerBarcode: text("customer_barcode"),
    cost: numeric("cost", { precision: 12, scale: 2 }),
    garmentType: text("garment_type"),
    color: text("color"),
    size: text("size"),
    retail: text("retail"),
    catalog: text("catalog").notNull().default("g54"),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("design_barcodes_design_idx").on(t.designNumber), index("design_barcodes_item_idx").on(t.designItemId)],
);

export type DesignBrand = typeof designBrands.$inferSelect;
export type DesignSuffix = typeof designSuffixes.$inferSelect;
export type BaseDesign = typeof baseDesigns.$inferSelect;
export type DesignItem = typeof designItems.$inferSelect;
export type DesignBarcode = typeof designBarcodes.$inferSelect;

export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteNumber: text("quote_number").notNull().unique(),
    bpId: uuid("bp_id").references(() => businessPartners.id, { onDelete: "set null" }),
    templateId: uuid("template_id").references(() => orderFormTemplates.id),
    status: quoteStatusEnum("status").notNull().default("draft"),
    isReorder: boolean("is_reorder").notNull().default(false),
    // ASI distributor-channel order — silkscreen lines price via the ASI engine.
    isAsi: boolean("is_asi").notNull().default(false),
    // Opaque token for the public customer approve/decline page (minted on send).
    publicToken: text("public_token").unique(),
    // The customer's approve/decline response captured on the public page.
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    signedName: text("signed_name"),
    responseNote: text("response_note"),
    responseIp: text("response_ip"),
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
    // Chosen size label (from the template's sizeOptions), when the item is size-priced.
    size: text("size"),
    qty: integer("qty").notNull().default(0),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull().default("0"),
    extended: numeric("extended", { precision: 12, scale: 2 }).notNull().default("0"),
    // Full quoting-calculator line: chosen blank garment, its color + tier, the
    // per-size quantity breakdown, and the decorations applied. Null on plain
    // catalog/custom lines. `unitPrice`/`extended` remain the source of truth for
    // totals; these carry the spec into the order/PDF.
    styleId: uuid("style_id").references(() => catalogStyles.id, { onDelete: "set null" }),
    color: text("color"),
    colorTier: text("color_tier"),
    sizeBreakdown: jsonb("size_breakdown"), // Record<size, qty>
    decorations: jsonb("decorations"), // DecorationInput[]
    extras: jsonb("extras"), // string[] of pricing_extras ids applied per garment (barcode, folding…)
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

// Customer-provided files captured at the quote/intake stage: art, mockups,
// reference photos. Copied onto the order (as order_attachments) when the quote
// is converted, so the art department picks them up automatically.
export const quoteAttachments = pgTable(
  "quote_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull().default("application/octet-stream"),
    sizeBytes: integer("size_bytes").notNull().default(0),
    kind: text("kind").notNull().default("art"), // art | mockup | reference | other
    contentBase64: text("content_base64").notNull(),
    notes: text("notes"),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("quote_attachments_quote_id_idx").on(t.quoteId)],
);
export type QuoteAttachment = typeof quoteAttachments.$inferSelect;

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
export type DecorationMethod = typeof decorationMethods.$inferSelect;
export type PrintLocation = typeof printLocations.$inferSelect;
export type ColorTier = typeof colorTiers.$inferSelect;
export type EmbroideryTier = typeof embroideryTiers.$inferSelect;
export type SizeClass = typeof sizeClasses.$inferSelect;
export type CatalogStyle = typeof catalogStyles.$inferSelect;
export type CatalogColor = typeof catalogColors.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
export type QuoteLine = typeof quoteLines.$inferSelect;
export type QuoteCharge = typeof quoteCharges.$inferSelect;
export type AutomationCampaign = typeof automationCampaigns.$inferSelect;
export type AutomationStep = typeof automationSteps.$inferSelect;
export type AutomationEnrollment = typeof automationEnrollments.$inferSelect;

// ---- Orders + customer-visible progress tracker ---------------------------

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNumber: text("order_number").notNull().unique(),
    bpId: uuid("bp_id").references(() => businessPartners.id, { onDelete: "set null" }),
    quoteId: uuid("quote_id").references(() => quotes.id, { onDelete: "set null" }),
    stage: orderStageEnum("stage").notNull().default("received"),
    // Opaque token for the public tracker link (no login required).
    publicToken: text("public_token").notNull().unique(),
    notes: text("notes"),
    // Production detail captured by the salesperson after the order is created.
    inHandsDate: timestamp("in_hands_date", { withTimezone: true }),
    productionNotes: text("production_notes"),
    // Operational fields mirrored from the legacy ERP sales-order model. These
    // drive the standard Open Orders / Sales Analysis reports.
    // Product/decoration line code (SS, OSH, ASI, VIN, SOUV, EMBC, EMBF, IH, ...).
    orderType: text("order_type"),
    poNumber: text("po_number"),
    shipVia: text("ship_via"),
    // Shipping / delivery — captured when the order ships.
    carrier: text("carrier"), // UPS | FedEx | USPS | DHL | Other (drives the tracking link)
    trackingNumber: text("tracking_number"),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    // Fulfillment urgency: ASAP / FIRM / DATED / RUSH / EVENT.
    dateType: text("date_type").notNull().default("ASAP"),
    // Requested due date (distinct from the internal in-hands target).
    dueDate: timestamp("due_date", { withTimezone: true }),
    // Order doc total, fixed at creation from the source quote.
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
    // Reorder of prior work — enables the fast-path (skip proof approval, still
    // send the customer a copy; press check defaults off on the job).
    isReorder: boolean("is_reorder").notNull().default(false),
    // Structured fulfillment instructions (replaces free-text warehouse notes).
    needsBarcode: boolean("needs_barcode").notNull().default(false),
    needsHangtag: boolean("needs_hangtag").notNull().default(false),
    needsFolding: boolean("needs_folding").notNull().default(false),
    nameDrop: text("name_drop"),
    upcBySize: jsonb("upc_by_size"), // { "S": "052774...", "M": "052774..." }
    fulfillmentNotes: text("fulfillment_notes"),
    // Committed ship date, chosen from the Ops ship calendar (yyyy-MM-dd).
    shipDate: text("ship_date"),
    // Sales employee credited with the order (defaults to the account owner).
    salesRepId: uuid("sales_rep_id").references(() => users.id, { onDelete: "set null" }),
    // Voiding an order requires a reason; a voided order is cancelled but retained.
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    voidedBy: uuid("voided_by").references(() => users.id),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("orders_bp_id_idx").on(t.bpId)],
);

// Read-only sales-order history migrated from SAP Business One (ORDR). Kept
// separate from the operational `orders` table so it doesn't feed the Orders
// list or the production board — it only powers a customer's buying history.
export const historicalOrders = pgTable(
  "historical_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bpId: uuid("bp_id").notNull().references(() => businessPartners.id, { onDelete: "cascade" }),
    docNum: text("doc_num").notNull(), // SAP DocNum
    docDate: timestamp("doc_date", { withTimezone: true }).notNull(),
    docTotal: numeric("doc_total", { precision: 14, scale: 2 }).notNull().default("0"),
    docStatus: text("doc_status"), // O = open, C = closed
    canceled: boolean("canceled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("historical_orders_bp_id_idx").on(t.bpId), index("historical_orders_bp_date_idx").on(t.bpId, t.docDate)],
);
export type HistoricalOrder = typeof historicalOrders.$inferSelect;

// ---- Accounting: Accounts Receivable (invoicing + payments) ----------------

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceNumber: text("invoice_number").notNull().unique(),
    bpId: uuid("bp_id").references(() => businessPartners.id, { onDelete: "set null" }),
    // The order this invoice bills, when raised from one (else standalone).
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    // Opaque token for the public pay/view link (no login). Minted when sent.
    publicToken: text("public_token").unique(),
    // AR reminder milestones already sent (e.g. ["before","duesoon","overdue","latefee"]).
    remindersSent: jsonb("reminders_sent"),
    status: invoiceStatusEnum("status").notNull().default("draft"),
    issueDate: timestamp("issue_date", { withTimezone: true }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    terms: text("terms"), // e.g. "Net 30"
    subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
    discount: numeric("discount", { precision: 14, scale: 2 }).notNull().default("0"),
    // Sales tax: the rate applied (e.g. 0.0725) and the computed tax amount.
    taxRate: numeric("tax_rate", { precision: 6, scale: 4 }).notNull().default("0"),
    tax: numeric("tax", { precision: 14, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 14, scale: 2 }).notNull().default("0"),
    notes: text("notes"),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("invoices_bp_id_idx").on(t.bpId), index("invoices_status_idx").on(t.status)],
);

export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    qty: integer("qty").notNull().default(1),
    unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull().default("0"),
    extended: numeric("extended", { precision: 14, scale: 2 }).notNull().default("0"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("invoice_lines_invoice_id_idx").on(t.invoiceId)],
);

// A customer payment. Applied to one invoice, or left on-account (invoiceId null).
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bpId: uuid("bp_id").references(() => businessPartners.id, { onDelete: "set null" }),
    invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    method: paymentMethodEnum("method").notNull().default("check"),
    reference: text("reference"), // check #, ACH trace, card last4, etc.
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
    receivedDate: timestamp("received_date", { withTimezone: true }).notNull().defaultNow(),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payments_bp_id_idx").on(t.bpId), index("payments_invoice_id_idx").on(t.invoiceId)],
);

export type Invoice = typeof invoices.$inferSelect;
export type InvoiceLine = typeof invoiceLines.$inferSelect;
export type Payment = typeof payments.$inferSelect;

// A salesperson's over-limit / on-hold order needs finance sign-off before it
// converts. Reps never see the numbers — they just submit; finance reviews here.
export const creditApprovalRequests = pgTable(
  "credit_approval_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id").references(() => quotes.id, { onDelete: "cascade" }),
    bpId: uuid("bp_id").references(() => businessPartners.id, { onDelete: "set null" }),
    reason: creditRequestReasonEnum("reason").notNull(),
    status: creditRequestStatusEnum("status").notNull().default("pending"),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"), // order total
    accountBalance: numeric("account_balance", { precision: 14, scale: 2 }).notNull().default("0"), // snapshot
    creditLimit: numeric("credit_limit", { precision: 14, scale: 2 }), // snapshot
    amountOver: numeric("amount_over", { precision: 14, scale: 2 }).notNull().default("0"),
    decisionNote: text("decision_note"),
    newLimit: numeric("new_limit", { precision: 14, scale: 2 }), // limit finance set on approval
    requestedBy: uuid("requested_by").references(() => users.id),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("credit_requests_status_idx").on(t.status), index("credit_requests_bp_idx").on(t.bpId)],
);
export type CreditApprovalRequest = typeof creditApprovalRequests.$inferSelect;

// ---- General Ledger (double-entry) ----------------------------------------
// Chart of accounts, journal entries, and their balanced debit/credit lines.
// Posted journal lines ARE the general ledger; account balances and the trial
// balance / financial statements are derived from them.
export const glAccounts = pgTable(
  "gl_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(), // e.g. "1000", "4000"
    name: text("name").notNull(),
    type: glAccountTypeEnum("type").notNull(),
    subtype: text("subtype"), // free-form grouping, e.g. "Current Asset", "COGS"
    description: text("description"),
    active: boolean("active").notNull().default(true),
    // Marks system accounts used by auto-posting (AR, sales, cash…) so they
    // aren't deleted; the key is a stable slug like "ar", "sales", "cash".
    systemKey: text("system_key").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("gl_accounts_type_idx").on(t.type)],
);
export type GlAccount = typeof glAccounts.$inferSelect;

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryNumber: text("entry_number").notNull().unique(), // "JE-00001"
    date: timestamp("date", { withTimezone: true }).notNull().defaultNow(), // effective posting date
    memo: text("memo"),
    status: journalStatusEnum("status").notNull().default("draft"),
    // Provenance: "manual" or an auto-post source ("invoice", "payment", …).
    source: text("source").notNull().default("manual"),
    sourceId: uuid("source_id"), // the invoice/payment/etc. this was posted from
    postedAt: timestamp("posted_at", { withTimezone: true }),
    postedBy: uuid("posted_by").references(() => users.id),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("journal_entries_status_idx").on(t.status), index("journal_entries_date_idx").on(t.date), index("journal_entries_source_idx").on(t.source, t.sourceId)],
);
export type JournalEntry = typeof journalEntries.$inferSelect;

export const journalLines = pgTable(
  "journal_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id").notNull().references(() => journalEntries.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull().references(() => glAccounts.id),
    debit: numeric("debit", { precision: 14, scale: 2 }).notNull().default("0"),
    credit: numeric("credit", { precision: 14, scale: 2 }).notNull().default("0"),
    memo: text("memo"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("journal_lines_entry_idx").on(t.entryId), index("journal_lines_account_idx").on(t.accountId)],
);
export type JournalLine = typeof journalLines.$inferSelect;

// ---- Accounts Payable (vendor bills) --------------------------------------
export const billStatusEnum = pgEnum("bill_status", ["draft", "open", "partial", "paid", "void"]);

export const vendors = pgTable(
  "vendors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    terms: text("terms"), // e.g. "Net 30"
    // Default expense/inventory GL account new bill lines suggest for this vendor.
    defaultAccountId: uuid("default_account_id").references(() => glAccounts.id, { onDelete: "set null" }),
    address: text("address"),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("vendors_name_idx").on(t.name)],
);
export type Vendor = typeof vendors.$inferSelect;

export const bills = pgTable(
  "bills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    billNumber: text("bill_number").notNull().unique(), // internal, "BILL-00001"
    vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    vendorRef: text("vendor_ref"), // the vendor's own invoice number
    status: billStatusEnum("status").notNull().default("draft"),
    issueDate: timestamp("issue_date", { withTimezone: true }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    terms: text("terms"),
    subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 14, scale: 2 }).notNull().default("0"),
    notes: text("notes"),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("bills_vendor_idx").on(t.vendorId), index("bills_status_idx").on(t.status)],
);
export type Bill = typeof bills.$inferSelect;

export const billLines = pgTable(
  "bill_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    billId: uuid("bill_id").notNull().references(() => bills.id, { onDelete: "cascade" }),
    // The GL account this line is charged to (expense, or an asset like Inventory).
    accountId: uuid("account_id").references(() => glAccounts.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    qty: numeric("qty", { precision: 14, scale: 2 }).notNull().default("1"),
    unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull().default("0"),
    extended: numeric("extended", { precision: 14, scale: 2 }).notNull().default("0"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("bill_lines_bill_idx").on(t.billId)],
);
export type BillLine = typeof billLines.$inferSelect;

export const billPayments = pgTable(
  "bill_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    billId: uuid("bill_id").references(() => bills.id, { onDelete: "set null" }),
    vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    method: paymentMethodEnum("method").notNull().default("check"),
    reference: text("reference"),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
    paidDate: timestamp("paid_date", { withTimezone: true }).notNull().defaultNow(),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("bill_payments_bill_idx").on(t.billId)],
);
export type BillPayment = typeof billPayments.$inferSelect;

// ---- Bank reconciliation --------------------------------------------------
// Imported bank-statement lines, matched/cleared against the GL cash account.
export const bankTransactions = pgTable(
  "bank_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    txnDate: timestamp("txn_date", { withTimezone: true }).notNull(),
    description: text("description").notNull().default(""),
    // Signed: positive = deposit/credit, negative = withdrawal/debit.
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
    cleared: boolean("cleared").notNull().default(false),
    // Set when this line was posted to the GL from the reconcile screen.
    journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id, { onDelete: "set null" }),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("bank_transactions_date_idx").on(t.txnDate)],
);
export type BankTransaction = typeof bankTransactions.$inferSelect;

// ---- Controlling (management accounting) ----------------------------------
// Annual budget per GL account, compared to actual postings.
export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").notNull().references(() => glAccounts.id, { onDelete: "cascade" }),
    fiscalYear: integer("fiscal_year").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
    updatedBy: uuid("updated_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("budgets_account_year_uk").on(t.accountId, t.fiscalYear)],
);
export type Budget = typeof budgets.$inferSelect;

// Admin/manager overrides for the built-in reports (title, hidden columns,
// default filters, sort, hidden sections). One shared row per report key —
// changes apply for everyone. See src/lib/reports/report-config.ts.
export const reportSettings = pgTable("report_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  reportKey: text("report_key").notNull().unique(),
  config: jsonb("config"), // ReportSettings
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ReportSettingsRow = typeof reportSettings.$inferSelect;

// Stage-change timeline (drives per-stage timestamps on the tracker).
export const orderEvents = pgTable(
  "order_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    stage: orderStageEnum("stage").notNull(),
    note: text("note"),
    byUserId: uuid("by_user_id").references(() => users.id, { onDelete: "set null" }),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_events_order_id_idx").on(t.orderId)],
);

// Generated documents attached to an order (e.g. the sales-order PDF).
export const orderArtifacts = pgTable(
  "order_artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull().default("application/pdf"),
    contentBase64: text("content_base64").notNull(),
    sentTo: text("sent_to"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    sendStatus: text("send_status").notNull().default("saved"), // saved | sent | queued | failed
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_artifacts_order_id_idx").on(t.orderId)],
);

// Line-level production spec — one entry per decorated product on the order.
// Fields are generic so they fit apparel (tees/hats) and non-apparel (cups, promo).
export const orderSpecItems = pgTable(
  "order_spec_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    product: text("product").notNull().default(""), // e.g. "Navy tee", "16oz mug"
    decorationMethod: text("decoration_method"), // screen print, embroidery, pad print…
    placement: text("placement"), // left chest, full back, wrap…
    colors: text("colors"), // ink/thread colors
    colorCount: integer("color_count"),
    sizeBreakdown: text("size_breakdown"), // "S:50 M:100 L:100" or "N/A"
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_spec_items_order_id_idx").on(t.orderId)],
);

// Customer-provided files: art, mockups, reference photos. Stored inline
// (base64) mirroring order_artifacts; a blob store can replace this later.
export const orderAttachments = pgTable(
  "order_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull().default("application/octet-stream"),
    sizeBytes: integer("size_bytes").notNull().default(0),
    kind: text("kind").notNull().default("art"), // art | mockup | reference | other
    contentBase64: text("content_base64").notNull(),
    notes: text("notes"),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_attachments_order_id_idx").on(t.orderId)],
);

// Customer-facing art/proof approvals. A proof references an uploaded
// attachment (the artwork) and is sent to the customer via a token link.
// The customer's decision is captured with a typed signature + IP + timestamp.
export const orderProofs = pgTable(
  "order_proofs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    attachmentId: uuid("attachment_id").references(() => orderAttachments.id, { onDelete: "set null" }),
    token: text("token").notNull().unique(),
    title: text("title").notNull().default("Proof"),
    message: text("message"), // optional note from the salesperson
    status: proofStatusEnum("status").notNull().default("pending"),
    responseNotes: text("response_notes"), // customer's notes with their decision
    signedName: text("signed_name"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    ip: text("ip"),
    requestedBy: uuid("requested_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_proofs_order_id_idx").on(t.orderId)],
);

// Art department work item for an order — one per order. Drives the Art queue
// (list) and Kanban (board) views. Status = Kanban column; assignee = artist.
export const artRequests = pgTable(
  "art_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .unique()
      .references(() => orders.id, { onDelete: "cascade" }),
    status: artStatusEnum("status").notNull().default("todo"),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    rush: boolean("rush").notNull().default(false),
    // Sales-controlled priority (P1/P2) used for the artist scheduling queue.
    priority: artPriorityEnum("priority").notNull().default("none"),
    // Estimated minutes to complete — feeds artist scheduling & workload.
    estimatedMinutes: integer("estimated_minutes"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    brief: text("brief"), // the customization brief from the sales meeting
    // Production routing + type-specific production details.
    productionType: artProductionTypeEnum("production_type"),
    stitchCount: integer("stitch_count"), // embroidery
    separationsDone: boolean("separations_done").notNull().default(false), // silkscreen
    sourcingType: text("sourcing_type"), // hard goods: in_house | domestic | import
    supplierNotes: text("supplier_notes"), // max colors, sizes, print-area limits, restrictions
    buyerSentAt: timestamp("buyer_sent_at", { withTimezone: true }), // headwear/hard-goods files sent to buyer
    digitizerSentAt: timestamp("digitizer_sent_at", { withTimezone: true }), // embroidery files sent to digitizer
    separationsSentAt: timestamp("separations_sent_at", { withTimezone: true }), // silkscreen seps sent to shop
    // Links: prior artwork reused, and the blank/apparel/headwear item used.
    previousDesignRef: text("previous_design_ref"),
    blankItemRef: text("blank_item_ref"),
    revisionCount: integer("revision_count").notNull().default(0),
    productionReadyAt: timestamp("production_ready_at", { withTimezone: true }),
    // The design/orderable item this art job produced. Punching this in is the
    // required gate before the art can be approved — creating it auto-makes the
    // inventory item (with art) so sales can order without SAP/Zoey re-entry.
    designItemId: uuid("design_item_id").references(() => designItems.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("art_requests_status_idx").on(t.status), index("art_requests_assigned_to_idx").on(t.assignedTo)],
);

// Revision history for an art request — each customer-requested change round.
export const artRevisions = pgTable(
  "art_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id").notNull().references(() => artRequests.id, { onDelete: "cascade" }),
    note: text("note"),
    minutesSpent: integer("minutes_spent"),
    byUserId: uuid("by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("art_revisions_request_idx").on(t.requestId)],
);
export type ArtRevision = typeof artRevisions.$inferSelect;

export type Order = typeof orders.$inferSelect;
export type OrderEvent = typeof orderEvents.$inferSelect;
export type OrderArtifact = typeof orderArtifacts.$inferSelect;
export type OrderSpecItem = typeof orderSpecItems.$inferSelect;
export type OrderAttachment = typeof orderAttachments.$inferSelect;
export type OrderProof = typeof orderProofs.$inferSelect;
export type ArtRequest = typeof artRequests.$inferSelect;

// Production job for an order — one per order. Drives the Production queue (list)
// and Kanban (board). Status = Kanban column; assignee = operator.
export const productionJobs = pgTable(
  "production_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .unique()
      .references(() => orders.id, { onDelete: "cascade" }),
    status: productionStatusEnum("status").notNull().default("queued"),
    // When true, the full run cannot start until a first-article press check is
    // approved by Art (see pressChecks). Defaults on; cleared for reorders.
    pressCheckRequired: boolean("press_check_required").notNull().default(true),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    rush: boolean("rush").notNull().default(false),
    dueDate: timestamp("due_date", { withTimezone: true }),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("production_jobs_status_idx").on(t.status), index("production_jobs_assigned_to_idx").on(t.assignedTo)],
);
export type ProductionJob = typeof productionJobs.$inferSelect;

// First-article press check: one row per attempt. Production submits a photo of
// the single test print; Art approves (releasing the full run) or requests
// changes (Production re-shoots). Every attempt and decision is retained.
export const pressChecks = pgTable(
  "press_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => productionJobs.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    attempt: integer("attempt").notNull().default(1),
    // The first-article photo, stored as an order attachment (kind "press_check").
    photoAttachmentId: uuid("photo_attachment_id").references(() => orderAttachments.id, { onDelete: "set null" }),
    status: pressCheckStatusEnum("status").notNull().default("pending"),
    submittedBy: uuid("submitted_by").references(() => users.id, { onDelete: "set null" }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("press_checks_job_id_idx").on(t.jobId), index("press_checks_status_idx").on(t.status)],
);
export type PressCheck = typeof pressChecks.$inferSelect;

// ---- Inventory (item master + stock ledger) -------------------------------
export const inventoryItems = pgTable(
  "inventory_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sku: text("sku").notNull().unique(),
    name: text("name").notNull(),
    category: text("category"),
    unit: text("unit").notNull().default("each"),
    supplier: text("supplier"),
    // Sales territory this item is stocked/sold for (reps sort inventory by it).
    territory: text("territory"),
    // Replenishment lead time (days) and whether it's an import (longer lead) —
    // used by the reorder forecast.
    leadTimeDays: integer("lead_time_days").notNull().default(30),
    isImport: boolean("is_import").notNull().default(false),
    cost: numeric("cost", { precision: 12, scale: 2 }).notNull().default("0"),
    onHand: numeric("on_hand", { precision: 14, scale: 2 }).notNull().default("0"),
    reorderPoint: numeric("reorder_point", { precision: 14, scale: 2 }).notNull().default("0"),
    // When we last raised a reorder alert for this item (dedupes the daily cron).
    // Cleared when stock is replenished back above the reorder point.
    reorderAlertAt: timestamp("reorder_alert_at", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    notes: text("notes"),
    // Art image carried onto the item when it's auto-created from a design.
    imageBase64: text("image_base64"),
    imageMimeType: text("image_mime_type"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("inventory_items_sku_idx").on(t.sku)],
);

// Append-only stock ledger — every change to on-hand is a signed movement.
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
    delta: numeric("delta", { precision: 14, scale: 2 }).notNull().default("0"), // + receive / - consume
    reason: stockReasonEnum("reason").notNull().default("adjust"),
    // Bin the movement affected; toBinId is the destination for a transfer.
    binId: uuid("bin_id").references(() => bins.id, { onDelete: "set null" }),
    toBinId: uuid("to_bin_id").references(() => bins.id, { onDelete: "set null" }),
    note: text("note"),
    byUserId: uuid("by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("stock_movements_item_id_idx").on(t.itemId)],
);

// ---- Bin / warehouse management -------------------------------------------
export const warehouses = pgTable("warehouses", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bins = pgTable(
  "bins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    warehouseId: uuid("warehouse_id").notNull().references(() => warehouses.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    description: text("description"),
    isReceiving: boolean("is_receiving").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("bins_whs_code_idx").on(t.warehouseId, t.code)],
);

// On-hand quantity of an item in a specific bin (the source of truth for stock).
export const itemBinStock = pgTable(
  "item_bin_stock",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id").notNull().references(() => inventoryItems.id, { onDelete: "cascade" }),
    binId: uuid("bin_id").notNull().references(() => bins.id, { onDelete: "cascade" }),
    qty: numeric("qty", { precision: 14, scale: 2 }).notNull().default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("item_bin_stock_item_bin_idx").on(t.itemId, t.binId), index("item_bin_stock_bin_idx").on(t.binId)],
);

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;
export type Warehouse = typeof warehouses.$inferSelect;
export type Bin = typeof bins.$inferSelect;
export type ItemBinStock = typeof itemBinStock.$inferSelect;

// ---- Custom report builder (Crystal-style saved reports + scheduling) ------
// A saved report is a data source + a JSON config (columns, filters, sort, limit).
export const reportDefinitions = pgTable("report_definitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  source: text("source").notNull(), // key into the data-source registry
  config: jsonb("config").notNull(), // { columns: string[]; filters: {field,op,value}[]; sortField?; sortDir?; rowLimit? }
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reportSchedules = pgTable(
  "report_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportId: uuid("report_id").notNull().references(() => reportDefinitions.id, { onDelete: "cascade" }),
    frequency: text("frequency").notNull().default("weekly"), // daily | weekly | monthly
    dayOfWeek: integer("day_of_week"), // 0=Sun..6=Sat (weekly)
    dayOfMonth: integer("day_of_month"), // 1..28 (monthly)
    format: text("format").notNull().default("csv"), // csv | pdf
    recipients: text("recipients").array().notNull(),
    active: boolean("active").notNull().default(true),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("report_schedules_report_id_idx").on(t.reportId)],
);

export type ReportDefinition = typeof reportDefinitions.$inferSelect;
export type ReportSchedule = typeof reportSchedules.$inferSelect;

// ---- Secure customer intake documents (terms / credit card applications) ---
// Customer completes these via a token link — no sensitive data over email.
// (The credit card application intentionally does NOT capture card numbers.)
export const customerDocuments = pgTable(
  "customer_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bpId: uuid("bp_id")
      .notNull()
      .references(() => businessPartners.id, { onDelete: "cascade" }),
    // Optionally tie a document request to a specific order so it surfaces on
    // that order's customer tracker. Null = an account-level (onboarding) request.
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }),
    docType: customerDocTypeEnum("doc_type").notNull(),
    token: text("token").notNull().unique(),
    status: customerDocStatusEnum("status").notNull().default("pending"),
    data: jsonb("data"), // submitted field values
    signedName: text("signed_name"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    ip: text("ip"),
    requestedBy: uuid("requested_by").references(() => users.id),
    // Auto-chase tracking for pending (unreturned) document requests.
    chasedAt: timestamp("chased_at", { withTimezone: true }),
    chaseCount: integer("chase_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("customer_documents_bp_id_idx").on(t.bpId), index("customer_documents_order_id_idx").on(t.orderId)],
);

export type CustomerDocument = typeof customerDocuments.$inferSelect;

// Finance-only document vault on a business partner — Experian reports,
// tax-exempt certs, signed credit apps, address-change and credit-limit
// justifications. Restricted to Finance/Admin (never Sales or Art).
export const customerAttachments = pgTable(
  "customer_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bpId: uuid("bp_id").notNull().references(() => businessPartners.id, { onDelete: "cascade" }),
    kind: customerAttachmentKindEnum("kind").notNull().default("other"),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull().default("application/pdf"),
    sizeBytes: integer("size_bytes").notNull().default(0),
    contentBase64: text("content_base64").notNull(),
    notes: text("notes"),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("customer_attachments_bp_id_idx").on(t.bpId)],
);
export type CustomerAttachment = typeof customerAttachments.$inferSelect;

// ---- Scheduling / calendar ------------------------------------------------

export const meetingTypes = pgTable("meeting_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  durationMin: integer("duration_min").notNull().default(30),
  description: text("description"),
  color: text("color").notNull().default("blue"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

// One public scheduling profile per salesperson.
export const schedulingProfiles = pgTable("scheduling_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().unique(),
  timezone: text("timezone").notNull().default("America/Denver"),
  active: boolean("active").notNull().default(true),
  minNoticeHours: integer("min_notice_hours").notNull().default(12),
  slotIntervalMin: integer("slot_interval_min").notNull().default(30),
  bookingWindowDays: integer("booking_window_days").notNull().default(21),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const availabilityBlocks = pgTable(
  "availability_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(), // 0=Sun .. 6=Sat
    startMin: integer("start_min").notNull(), // minutes from local midnight
    endMin: integer("end_min").notNull(),
  },
  (t) => [index("availability_user_idx").on(t.userId)],
);

export const meetings = pgTable(
  "meetings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingTypeId: uuid("meeting_type_id").references(() => meetingTypes.id),
    hostUserId: uuid("host_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bpId: uuid("bp_id").references(() => businessPartners.id, { onDelete: "set null" }),
    attendeeName: text("attendee_name").notNull(),
    attendeeEmail: text("attendee_email"),
    attendeePhone: text("attendee_phone"),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    status: meetingStatusEnum("status").notNull().default("scheduled"),
    notes: text("notes"),
    source: text("source").notNull().default("public"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("meetings_host_idx").on(t.hostUserId), index("meetings_start_idx").on(t.startAt)],
);

export type MeetingType = typeof meetingTypes.$inferSelect;
export type SchedulingProfile = typeof schedulingProfiles.$inferSelect;
export type AvailabilityBlock = typeof availabilityBlocks.$inferSelect;
export type Meeting = typeof meetings.$inferSelect;

// ---- Web Store (native storefront, replacing Zoey) -------------------------

// Merchandising categories for the storefront (separate from the internal
// inventory `category` text field).
export const storeCategories = pgTable(
  "store_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("store_categories_slug_idx").on(t.slug)],
);

// A product published to the storefront. Usually backed by a stock inventory
// item (the public store sells existing inventory only); pricing/description/
// image live here so the store presentation is independent of internal stock.
export const storeProducts = pgTable(
  "store_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inventoryItemId: uuid("inventory_item_id").references(() => inventoryItems.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    categoryId: uuid("category_id").references(() => storeCategories.id, { onDelete: "set null" }),
    // Public retail price; B2B price optional (falls back to retail when null).
    retailPrice: numeric("retail_price", { precision: 12, scale: 2 }).notNull().default("0"),
    b2bPrice: numeric("b2b_price", { precision: 12, scale: 2 }),
    visibility: storeVisibilityEnum("visibility").notNull().default("both"),
    published: boolean("published").notNull().default(false),
    featured: boolean("featured").notNull().default(false),
    taxable: boolean("taxable").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    // Optional store-specific image; when null the storefront uses the linked
    // inventory item's image.
    imageBase64: text("image_base64"),
    imageMimeType: text("image_mime_type"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("store_products_slug_idx").on(t.slug),
    index("store_products_category_idx").on(t.categoryId),
    index("store_products_inventory_idx").on(t.inventoryItemId),
  ],
);

// Purchasable variations of a product (e.g. "Large / Navy"). A product with no
// variants is bought as-is; with variants the buyer must pick one. priceDelta is
// added to the product's base price before any B2B/group discount.
export const storeProductVariants = pgTable(
  "store_product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").notNull().references(() => storeProducts.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    sku: text("sku"),
    priceDelta: numeric("price_delta", { precision: 12, scale: 2 }).notNull().default("0"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("store_product_variants_product_idx").on(t.productId)],
);
export type StoreProductVariant = typeof storeProductVariants.$inferSelect;

export type StoreCategory = typeof storeCategories.$inferSelect;
export type StoreProduct = typeof storeProducts.$inferSelect;

// Customer pricing tiers — a group carries a % discount applied on top of the
// customer's price (retail or B2B).
export const storeCustomerGroups = pgTable("store_customer_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  discountPct: numeric("discount_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Storefront customer account (separate auth realm from staff `users`). Linked
// to a CRM Business Partner when matched. Self-register → pending → admin approves.
export const storeCustomers = pgTable(
  "store_customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bpId: uuid("bp_id").references(() => businessPartners.id, { onDelete: "set null" }),
    groupId: uuid("group_id").references(() => storeCustomerGroups.id, { onDelete: "set null" }),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash"),
    name: text("name").notNull(),
    phone: text("phone"),
    companyName: text("company_name"),
    status: storeCustomerStatusEnum("status").notNull().default("pending"),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("store_customers_email_idx").on(t.email), index("store_customers_status_idx").on(t.status)],
);

// Storefront customer sessions (independent of staff `sessions`).
export const storeCustomerSessions = pgTable("store_customer_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull().references(() => storeCustomers.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Portal invitations — a one-time set-password token for a store customer,
// mirroring staff `passwordResetTokens`. Used for the invite-based portal.
export const storeCustomerInvites = pgTable("store_customer_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull().references(() => storeCustomers.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// An order placed through the storefront. On-account/request model — no online
// payment; staff confirm and fulfil. Guest (public) orders have no customerId.
export const storeOrders = pgTable(
  "store_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNumber: text("order_number").notNull().unique(),
    customerId: uuid("customer_id").references(() => storeCustomers.id, { onDelete: "set null" }),
    isB2b: boolean("is_b2b").notNull().default(false),
    status: storeOrderStatusEnum("status").notNull().default("pending"),
    // True once this order's line quantities have been deducted from stock
    // (on confirm). Restored (and reset) if the order is later canceled.
    stockApplied: boolean("stock_applied").notNull().default(false),
    // The ops sales order spawned from this store order (on confirm), so it
    // flows through production + AR. Null until confirmed.
    salesOrderId: uuid("sales_order_id").references(() => orders.id, { onDelete: "set null" }),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    shippingAddress: text("shipping_address"),
    notes: text("notes"),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
    discount: numeric("discount", { precision: 12, scale: 2 }).notNull().default("0"),
    promoCode: text("promo_code"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("store_orders_customer_idx").on(t.customerId), index("store_orders_status_idx").on(t.status)],
);

export const storeOrderItems = pgTable(
  "store_order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull().references(() => storeOrders.id, { onDelete: "cascade" }),
    storeProductId: uuid("store_product_id").references(() => storeProducts.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    sku: text("sku"),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
    qty: integer("qty").notNull().default(1),
    lineTotal: numeric("line_total", { precision: 12, scale: 2 }).notNull(),
  },
  (t) => [index("store_order_items_order_idx").on(t.orderId)],
);

export type StoreCustomer = typeof storeCustomers.$inferSelect;
export type StoreCustomerGroup = typeof storeCustomerGroups.$inferSelect;
export type StoreOrder = typeof storeOrders.$inferSelect;
export type StoreOrderItem = typeof storeOrderItems.$inferSelect;

// Storefront configuration — a single row (branding + open/close toggles).
export const storeSettings = pgTable("store_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeName: text("store_name").notNull().default("The G54 Store"),
  tagline: text("tagline"),
  heroHeadline: text("hero_headline"),
  heroSubtext: text("hero_subtext"),
  contactEmail: text("contact_email"),
  // Master switch, and whether the general public (not logged-in) may shop.
  enabled: boolean("enabled").notNull().default(true),
  publicEnabled: boolean("public_enabled").notNull().default(true),
  // When on, confirming an on-account order also drafts an AR invoice.
  autoInvoice: boolean("auto_invoice").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StoreSettings = typeof storeSettings.$inferSelect;

// Storefront promo / coupon codes applied at checkout.
export const storePromos = pgTable(
  "store_promos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(), // stored uppercase
    description: text("description"),
    kind: storePromoKindEnum("kind").notNull().default("percent"),
    value: numeric("value", { precision: 12, scale: 2 }).notNull().default("0"), // percent (0-100) or fixed $
    active: boolean("active").notNull().default(true),
    minSubtotal: numeric("min_subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    usageLimit: integer("usage_limit"), // null = unlimited
    usedCount: integer("used_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("store_promos_code_idx").on(t.code)],
);

export type StorePromo = typeof storePromos.$inferSelect;

// ─────────────────────────── Softgoods Pricing Engine ──────────────────────
// Reverse-engineered from "Version 11 – 2026 Softgood Pricing Calculator Tool".
// Replaces the hand-maintained spreadsheet. Reference band matrices live as JSON
// on pricing_methods (edited rarely); the lists people actually change twice a
// year — garment costs, extras, vendor freight, royalties — are normalized rows.

// A decoration method (silkscreen, embroidery, …) and its rate matrices.
export const pricingMethods = pgTable("pricing_methods", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(), // silkscreen | embroidery | dtf | asi
  label: text("label").notNull(),
  active: boolean("active").notNull().default(true),
  // { qtyBreaks:[], multipliers:[], locationCharges:[]|stitchCharges:[],
  //   sizeUpcharges:{}, tiers:{}, locationAdders:{}, digitizingNew:number }
  config: jsonb("config").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type PricingMethod = typeof pricingMethods.$inferSelect;

// Garment cost catalog (the calculator's garment-number → cost lookup).
export const pricingGarments = pgTable(
  "pricing_garments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    garmentNumber: text("garment_number").notNull().unique(),
    itemCode: text("item_code"),
    cost: numeric("cost", { precision: 12, scale: 4 }).notNull().default("0"),
    supplier: text("supplier"),
    description: text("description"),
    active: boolean("active").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pricing_garments_number_idx").on(t.garmentNumber), index("pricing_garments_supplier_idx").on(t.supplier)],
);
export type PricingGarment = typeof pricingGarments.$inferSelect;

// Fulfillment / decoration add-on charges (barcode, folding, glitter ink, …).
export const pricingExtras = pgTable("pricing_extras", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  kind: text("kind").notNull().default("fulfillment"), // fulfillment | decoration
  amount: numeric("amount", { precision: 12, scale: 4 }), // null = quote/manual
  manualQuote: boolean("manual_quote").notNull().default(false),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});
export type PricingExtra = typeof pricingExtras.$inferSelect;

// Per-vendor apparel freight rules (auto-applied to garment cost).
export const pricingVendorFreight = pgTable("pricing_vendor_freight", {
  id: uuid("id").primaryKey().defaultRandom(),
  vendor: text("vendor").notNull(),
  addPerGarment: numeric("add_per_garment", { precision: 12, scale: 4 }),
  freeOverCost: numeric("free_over_cost", { precision: 12, scale: 2 }), // waive if order cost ≥ this
  underThreshold: numeric("under_threshold", { precision: 12, scale: 2 }), // charge only if order cost < this
  active: boolean("active").notNull().default(true),
});
export type PricingVendorFreight = typeof pricingVendorFreight.$inferSelect;

// Artist royalty rates (added as a % on top of the decorated price).
export const pricingRoyalties = pgTable("pricing_royalties", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  pct: numeric("pct", { precision: 6, scale: 4 }).notNull().default("0"),
  active: boolean("active").notNull().default(true),
});
export type PricingRoyalty = typeof pricingRoyalties.$inferSelect;

// ───────────────────────────── Ship Calendar ───────────────────────────────
// Ops publishes the dates the shop can ship on (Tyson's weekly schedule). Orders
// pick their committed ship date from these. Stored as yyyy-MM-dd calendar days.
export const shipCalendar = pgTable(
  "ship_calendar",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    day: text("day").notNull().unique(), // yyyy-MM-dd
    capacity: integer("capacity"), // optional daily order cap (null = unlimited)
    note: text("note"),
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ship_calendar_day_idx").on(t.day)],
);
export type ShipCalendarDay = typeof shipCalendar.$inferSelect;

// ───────────────────────── Landed cost (freight spreading) ─────────────────
// Spread a shipment's freight (and other landed charges) across the items on
// it so each item's cost reflects true landed cost (PO cost + freight share).
// Applying updates each item's moving-average cost; a rolling 365-day landed
// average is computed from applied lines for the inventory-costing report.
export const landedCostDocs = pgTable(
  "landed_cost_docs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    docNumber: text("doc_number").notNull().unique(), // LC-#####
    vendor: text("vendor"), // freight company
    shipmentRef: text("shipment_ref"), // container / BOL / packet ref
    freightAmount: numeric("freight_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    otherCharges: numeric("other_charges", { precision: 14, scale: 2 }).notNull().default("0"),
    otherLabel: text("other_label"), // e.g. duty, brokerage
    basis: text("basis").notNull().default("quantity"), // quantity | value
    status: text("status").notNull().default("draft"), // draft | applied
    notes: text("notes"),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("landed_cost_docs_status_idx").on(t.status)],
);
export const landedCostLines = pgTable(
  "landed_cost_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    docId: uuid("doc_id").notNull().references(() => landedCostDocs.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").references(() => inventoryItems.id, { onDelete: "set null" }),
    sku: text("sku"),
    description: text("description"),
    qty: numeric("qty", { precision: 14, scale: 2 }).notNull().default("0"),
    baseUnitCost: numeric("base_unit_cost", { precision: 14, scale: 4 }).notNull().default("0"),
    // Frozen at apply: freight+other allocated to this line, and the landed unit.
    allocated: numeric("allocated", { precision: 14, scale: 2 }).notNull().default("0"),
    landedUnitCost: numeric("landed_unit_cost", { precision: 14, scale: 4 }).notNull().default("0"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("landed_cost_lines_doc_id_idx").on(t.docId), index("landed_cost_lines_item_id_idx").on(t.itemId)],
);
export type LandedCostDoc = typeof landedCostDocs.$inferSelect;
export type LandedCostLine = typeof landedCostLines.$inferSelect;

// ───────────────────── In-house production order (build) ────────────────────
// One document that consumes blank inventory and produces finished-good
// inventory — replacing the manual SO+PO dance and the monthly COGS journal.
// Posting moves stock (blanks out, finished in) and rolls the blank cost (plus
// any capitalized added labor/overhead) into the finished item's cost.
export const productionOrders = pgTable(
  "production_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    docNumber: text("doc_number").notNull().unique(), // PRD-#####
    status: text("status").notNull().default("draft"), // draft | posted
    // Labor/overhead to capitalize into the produced goods (0 = blanks only).
    addedCost: numeric("added_cost", { precision: 14, scale: 2 }).notNull().default("0"),
    notes: text("notes"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("production_orders_status_idx").on(t.status)],
);
export const productionOrderLines = pgTable(
  "production_order_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    docId: uuid("doc_id").notNull().references(() => productionOrders.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // consume | produce
    itemId: uuid("item_id").references(() => inventoryItems.id, { onDelete: "set null" }),
    sku: text("sku"),
    description: text("description"),
    qty: numeric("qty", { precision: 14, scale: 2 }).notNull().default("0"),
    binId: uuid("bin_id").references(() => bins.id, { onDelete: "set null" }),
    unitCost: numeric("unit_cost", { precision: 14, scale: 4 }).notNull().default("0"), // frozen at post
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("production_order_lines_doc_id_idx").on(t.docId)],
);
export type ProductionOrder = typeof productionOrders.$inferSelect;
export type ProductionOrderLine = typeof productionOrderLines.$inferSelect;

// ─────────────────────── Recurring journal entries ─────────────────────────
// A saved journal template that auto-posts once per month (rent, insurance,
// recurring accruals) so finance doesn't re-key the same entry every period.
export const recurringJournals = pgTable("recurring_journals", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  dayOfMonth: integer("day_of_month").notNull().default(1), // 1–28
  memo: text("memo"),
  active: boolean("active").notNull().default(true),
  lastPostedYm: text("last_posted_ym"), // "YYYY-MM" of the last auto-post
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const recurringJournalLines = pgTable(
  "recurring_journal_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id").notNull().references(() => recurringJournals.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull().references(() => glAccounts.id, { onDelete: "cascade" }),
    debit: numeric("debit", { precision: 14, scale: 2 }).notNull().default("0"),
    credit: numeric("credit", { precision: 14, scale: 2 }).notNull().default("0"),
    memo: text("memo"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("recurring_journal_lines_template_id_idx").on(t.templateId)],
);
export type RecurringJournal = typeof recurringJournals.$inferSelect;
export type RecurringJournalLine = typeof recurringJournalLines.$inferSelect;

// ───────────────────── Purchase orders & goods receipts ────────────────────
// Procurement: raise a PO to a vendor, receive goods against it (into stock),
// and let the vendor bill clear the GRNI (goods received, not invoiced) balance.
export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    poNumber: text("po_number").notNull().unique(), // PO-#####
    vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    status: text("status").notNull().default("draft"), // draft | open | received | closed | void
    orderDate: timestamp("order_date", { withTimezone: true }),
    expectedDate: timestamp("expected_date", { withTimezone: true }),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("purchase_orders_status_idx").on(t.status), index("purchase_orders_vendor_idx").on(t.vendorId)],
);
export const purchaseOrderLines = pgTable(
  "purchase_order_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    poId: uuid("po_id").notNull().references(() => purchaseOrders.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").references(() => inventoryItems.id, { onDelete: "set null" }),
    sku: text("sku"),
    description: text("description"),
    qty: numeric("qty", { precision: 14, scale: 2 }).notNull().default("0"),
    unitCost: numeric("unit_cost", { precision: 14, scale: 4 }).notNull().default("0"),
    receivedQty: numeric("received_qty", { precision: 14, scale: 2 }).notNull().default("0"),
    binId: uuid("bin_id").references(() => bins.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("purchase_order_lines_po_idx").on(t.poId), index("purchase_order_lines_item_idx").on(t.itemId)],
);
export const goodsReceipts = pgTable(
  "goods_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    grNumber: text("gr_number").notNull().unique(), // GR-#####
    poId: uuid("po_id").references(() => purchaseOrders.id, { onDelete: "set null" }),
    receivedDate: timestamp("received_date", { withTimezone: true }).notNull().defaultNow(),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("goods_receipts_po_idx").on(t.poId)],
);
export const goodsReceiptLines = pgTable(
  "goods_receipt_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    grId: uuid("gr_id").notNull().references(() => goodsReceipts.id, { onDelete: "cascade" }),
    poLineId: uuid("po_line_id").references(() => purchaseOrderLines.id, { onDelete: "set null" }),
    itemId: uuid("item_id").references(() => inventoryItems.id, { onDelete: "set null" }),
    qty: numeric("qty", { precision: 14, scale: 2 }).notNull().default("0"),
    unitCost: numeric("unit_cost", { precision: 14, scale: 4 }).notNull().default("0"),
    binId: uuid("bin_id").references(() => bins.id, { onDelete: "set null" }),
  },
  (t) => [index("goods_receipt_lines_gr_idx").on(t.grId)],
);
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type PurchaseOrderLine = typeof purchaseOrderLines.$inferSelect;
export type GoodsReceipt = typeof goodsReceipts.$inferSelect;

// ───────────────────── Customer contract / special pricing ─────────────────
// Per-customer negotiated pricing: a blanket % off list, or a fixed all-in unit
// price for a specific garment style (the "whale exception", e.g. Pilot hoodies
// at $18.95). Applied on top of the pricing engine in the quote builder.
export const customerPricing = pgTable(
  "customer_pricing",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bpId: uuid("bp_id").notNull().references(() => businessPartners.id, { onDelete: "cascade" }),
    styleId: uuid("style_id").references(() => catalogStyles.id, { onDelete: "cascade" }), // null = applies to every garment
    type: text("type").notNull(), // pct_off | fixed_unit
    value: numeric("value", { precision: 12, scale: 4 }).notNull().default("0"), // pct_off: percent; fixed_unit: $/unit
    note: text("note"),
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("customer_pricing_bp_idx").on(t.bpId)],
);
export type CustomerPricing = typeof customerPricing.$inferSelect;

// ───────────────────────── Fixed assets & depreciation ─────────────────────
// The fixed-asset register: capitalized equipment/vehicles/furniture with
// straight-line depreciation. A monthly depreciation run posts one period of
// expense across every active asset (Dr Depreciation Expense / Cr Accumulated
// Depreciation); disposal removes the asset and books any gain/loss. Completes
// the SAP B1 finance decommission (roadmap Phase 5).
export const fixedAssets = pgTable(
  "fixed_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetNumber: text("asset_number").notNull().unique(), // FA-#####
    name: text("name").notNull(),
    category: text("category").notNull().default("equipment"), // equipment | vehicle | furniture | computer | building | leasehold | other
    description: text("description"),
    // Acquisition + capitalized cost.
    acquisitionDate: timestamp("acquisition_date", { withTimezone: true }),
    inServiceDate: timestamp("in_service_date", { withTimezone: true }), // depreciation begins here
    cost: numeric("cost", { precision: 14, scale: 2 }).notNull().default("0"),
    salvageValue: numeric("salvage_value", { precision: 14, scale: 2 }).notNull().default("0"),
    usefulLifeMonths: integer("useful_life_months").notNull().default(60),
    method: text("method").notNull().default("straight_line"), // straight_line (only method for now)
    // Running accumulated depreciation posted through depreciation runs.
    accumulatedDepreciation: numeric("accumulated_depreciation", { precision: 14, scale: 2 }).notNull().default("0"),
    status: text("status").notNull().default("active"), // active | fully_depreciated | disposed
    // Disposal.
    disposedDate: timestamp("disposed_date", { withTimezone: true }),
    disposalProceeds: numeric("disposal_proceeds", { precision: 14, scale: 2 }),
    disposalNote: text("disposal_note"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("fixed_assets_status_idx").on(t.status), index("fixed_assets_category_idx").on(t.category)],
);
export type FixedAsset = typeof fixedAssets.$inferSelect;

// A monthly depreciation run — one posted journal covering every active asset.
export const depreciationRuns = pgTable(
  "depreciation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runNumber: text("run_number").notNull().unique(), // DEP-#####
    periodYm: text("period_ym").notNull(), // "YYYY-MM" the run depreciates
    status: text("status").notNull().default("draft"), // draft | posted
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id, { onDelete: "set null" }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    postedBy: uuid("posted_by").references(() => users.id),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("depreciation_runs_period_uk").on(t.periodYm), index("depreciation_runs_status_idx").on(t.status)],
);
export type DepreciationRun = typeof depreciationRuns.$inferSelect;

// Per-asset depreciation amount within a run (the audit trail behind the JE).
export const depreciationLines = pgTable(
  "depreciation_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").notNull().references(() => depreciationRuns.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").notNull().references(() => fixedAssets.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
  },
  (t) => [index("depreciation_lines_run_idx").on(t.runId), index("depreciation_lines_asset_idx").on(t.assetId)],
);
export type DepreciationLine = typeof depreciationLines.$inferSelect;

// ────────────────────── Cost centers & job costing ─────────────────────────
// Departments (silkscreen, embroidery, DTF, art) and overhead pools (warehouse)
// carry a labor rate. Actual job costs are captured against a production job and
// its cost center, giving true order/customer profitability instead of a flat
// company-average margin. Overhead pools allocate to departments by percentage.
export const costCenters = pgTable(
  "cost_centers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(), // e.g. "SS", "EMB", "WHSE"
    name: text("name").notNull(),
    kind: text("kind").notNull().default("department"), // department | overhead
    // Fully-burdened labor rate ($/hour) used to cost captured labor minutes.
    laborRatePerHour: numeric("labor_rate_per_hour", { precision: 12, scale: 2 }).notNull().default("0"),
    description: text("description"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("cost_centers_kind_idx").on(t.kind)],
);
export type CostCenter = typeof costCenters.$inferSelect;

// How an overhead pool's cost spreads to departments (percentages, ~100%).
export const costCenterAllocations = pgTable(
  "cost_center_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromCostCenterId: uuid("from_cost_center_id").notNull().references(() => costCenters.id, { onDelete: "cascade" }),
    toCostCenterId: uuid("to_cost_center_id").notNull().references(() => costCenters.id, { onDelete: "cascade" }),
    pct: numeric("pct", { precision: 6, scale: 3 }).notNull().default("0"), // 0–100
  },
  (t) => [index("cost_center_allocations_from_idx").on(t.fromCostCenterId)],
);
export type CostCenterAllocation = typeof costCenterAllocations.$inferSelect;

// A captured actual cost on a production job (labor / material / machine / other).
export const jobCosts = pgTable(
  "job_costs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").notNull().references(() => productionJobs.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    costCenterId: uuid("cost_center_id").references(() => costCenters.id, { onDelete: "set null" }),
    kind: text("kind").notNull().default("labor"), // labor | material | machine | other
    description: text("description"),
    minutes: integer("minutes").notNull().default(0), // for labor: drives amount at the CC rate
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("job_costs_job_idx").on(t.jobId), index("job_costs_order_idx").on(t.orderId), index("job_costs_cc_idx").on(t.costCenterId)],
);
export type JobCost = typeof jobCosts.$inferSelect;

// ─────────────────────────── Quality management ────────────────────────────
// QC inspections against a production job: incoming (blanks), in-process, or
// final. Records qty inspected/rejected, a pass/fail/conditional result, and
// itemized defects. QC was a hidden bottleneck at G54, so it's tracked here.
export const qualityInspections = pgTable(
  "quality_inspections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inspectionNumber: text("inspection_number").notNull().unique(), // QC-#####
    jobId: uuid("job_id").references(() => productionJobs.id, { onDelete: "set null" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    stage: text("stage").notNull().default("final"), // incoming | in_process | final
    result: text("result").notNull().default("pass"), // pass | fail | conditional
    qtyInspected: integer("qty_inspected").notNull().default(0),
    qtyRejected: integer("qty_rejected").notNull().default(0),
    inspectorId: uuid("inspector_id").references(() => users.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("quality_inspections_job_idx").on(t.jobId), index("quality_inspections_result_idx").on(t.result)],
);
export type QualityInspection = typeof qualityInspections.$inferSelect;

export const qualityDefects = pgTable(
  "quality_defects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inspectionId: uuid("inspection_id").notNull().references(() => qualityInspections.id, { onDelete: "cascade" }),
    defectType: text("defect_type").notNull().default("other"), // misprint | registration | color | placement | stain | count | garment | other
    qty: integer("qty").notNull().default(1),
    note: text("note"),
  },
  (t) => [index("quality_defects_inspection_idx").on(t.inspectionId)],
);
export type QualityDefect = typeof qualityDefects.$inferSelect;

// ────────────────────────── Equipment maintenance ──────────────────────────
// The shop-floor equipment register (presses, dryers, embroidery machines) with
// preventive-maintenance schedules and work orders (preventive/repair). Tracks
// downtime and cost so equipment reliability feeds the department cost model.
export const equipment = pgTable(
  "equipment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(), // EQ-#####
    name: text("name").notNull(),
    type: text("type").notNull().default("press"), // press | dryer | embroidery_machine | dtf_printer | heat_press | compressor | vehicle | other
    location: text("location"),
    serialNumber: text("serial_number"),
    // Optional link to the department cost center this machine belongs to.
    costCenterId: uuid("cost_center_id").references(() => costCenters.id, { onDelete: "set null" }),
    purchaseDate: timestamp("purchase_date", { withTimezone: true }),
    status: text("status").notNull().default("operational"), // operational | needs_service | down | retired
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("equipment_status_idx").on(t.status), index("equipment_type_idx").on(t.type)],
);
export type Equipment = typeof equipment.$inferSelect;

// A recurring preventive-maintenance task on a machine (every N days).
export const maintenanceSchedules = pgTable(
  "maintenance_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    equipmentId: uuid("equipment_id").notNull().references(() => equipment.id, { onDelete: "cascade" }),
    task: text("task").notNull(),
    intervalDays: integer("interval_days").notNull().default(30),
    lastDoneDate: timestamp("last_done_date", { withTimezone: true }),
    nextDueDate: timestamp("next_due_date", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("maintenance_schedules_equipment_idx").on(t.equipmentId), index("maintenance_schedules_due_idx").on(t.nextDueDate)],
);
export type MaintenanceSchedule = typeof maintenanceSchedules.$inferSelect;

// A maintenance work order (preventive, repair, or inspection).
export const maintenanceWorkOrders = pgTable(
  "maintenance_work_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    woNumber: text("wo_number").notNull().unique(), // MWO-#####
    equipmentId: uuid("equipment_id").notNull().references(() => equipment.id, { onDelete: "cascade" }),
    scheduleId: uuid("schedule_id").references(() => maintenanceSchedules.id, { onDelete: "set null" }),
    type: text("type").notNull().default("repair"), // preventive | repair | inspection
    status: text("status").notNull().default("open"), // open | in_progress | completed | canceled
    priority: text("priority").notNull().default("normal"), // low | normal | high | urgent
    description: text("description"),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    scheduledDate: timestamp("scheduled_date", { withTimezone: true }),
    completedDate: timestamp("completed_date", { withTimezone: true }),
    downtimeMinutes: integer("downtime_minutes").notNull().default(0),
    cost: numeric("cost", { precision: 14, scale: 2 }).notNull().default("0"),
    resolution: text("resolution"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("maintenance_wo_equipment_idx").on(t.equipmentId), index("maintenance_wo_status_idx").on(t.status)],
);
export type MaintenanceWorkOrder = typeof maintenanceWorkOrders.$inferSelect;

// ───────────────────────── Workflows & approvals ───────────────────────────
// Approval-rules engine: thresholds that require a manager/finance sign-off
// (e.g. an order ≥ $5,000, a discount over a cap). Matching events raise an
// approval request that lands in the approvals inbox.
export const approvalRules = pgTable(
  "approval_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    entityType: text("entity_type").notNull().default("order"), // order | quote | discount | bill | generic
    metric: text("metric").notNull().default("amount"), // amount | discount_pct
    operator: text("operator").notNull().default("gte"), // gte | gt
    threshold: numeric("threshold", { precision: 14, scale: 2 }).notNull().default("0"),
    approverRole: roleEnum("approver_role").notNull().default("sales_manager"),
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("approval_rules_entity_idx").on(t.entityType), index("approval_rules_active_idx").on(t.active)],
);
export type ApprovalRule = typeof approvalRules.$inferSelect;

// A single approval request raised by a rule (or manually), routed to a role.
export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestNumber: text("request_number").notNull().unique(), // APR-#####
    ruleId: uuid("rule_id").references(() => approvalRules.id, { onDelete: "set null" }),
    entityType: text("entity_type").notNull().default("generic"),
    entityId: uuid("entity_id"),
    title: text("title").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }),
    approverRole: roleEnum("approver_role").notNull().default("sales_manager"),
    status: text("status").notNull().default("pending"), // pending | approved | rejected
    note: text("note"),
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("approval_requests_status_idx").on(t.status), index("approval_requests_entity_idx").on(t.entityType, t.entityId)],
);
export type ApprovalRequest = typeof approvalRequests.$inferSelect;

// A log of one-click workflow runs — a chain of steps executed as a single
// action (e.g. onboard a customer: create BP → log activity → request credit
// review). Each step's outcome is captured for an audit trail.
export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowKey: text("workflow_key").notNull(), // stable slug of the workflow definition
    label: text("label").notNull(),
    status: text("status").notNull().default("completed"), // completed | failed
    steps: jsonb("steps"), // [{ name, ok, detail }]
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    startedBy: uuid("started_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("workflow_runs_key_idx").on(t.workflowKey), index("workflow_runs_created_idx").on(t.createdAt)],
);
export type WorkflowRun = typeof workflowRuns.$inferSelect;

// ───────────────────── Content Library (digital asset mgmt) ────────────────
// A searchable library of graphic assets (logos, artwork, mockups, photos).
// Uploads get an AI-generated description + tags (when AI is configured), can be
// grouped into collections, assigned to a client, carry usage rights, and link
// to jobs. Natural-language & visual-similarity search use Voyage embeddings
// stored in a separate pgvector table (see src/lib/content/embeddings.ts), with
// keyword/tag search as the always-on fallback.
export const contentCollections = pgTable(
  "content_collections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("content_collections_name_idx").on(t.name)],
);
export type ContentCollection = typeof contentCollections.$inferSelect;

export const contentAssets = pgTable(
  "content_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetNumber: text("asset_number").notNull().unique(), // CA-#####
    title: text("title").notNull(),
    description: text("description"), // AI-generated or manual
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull().default("application/octet-stream"),
    sizeBytes: integer("size_bytes").notNull().default(0),
    kind: text("kind").notNull().default("image"), // image | vector | document | other
    // Where the file bytes live. "db" = base64 in this row (legacy/small); "azure_files"
    // = the real file lives on the Azure Files share (source of truth) and only its
    // path is stored here. Neon never holds the large image bytes for azure assets.
    storageProvider: text("storage_provider").notNull().default("db"), // db | azure_files
    storageShare: text("storage_share"), // Azure Files share name
    storagePath: text("storage_path"), // path within the share, e.g. "logos/moose.png"
    contentBase64: text("content_base64"), // null for azure-backed assets
    thumbnailBase64: text("thumbnail_base64"), // small generated preview for images (else null)
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }), // last time the Azure crawl saw this file
    tags: text("tags").array(),
    collectionId: uuid("collection_id").references(() => contentCollections.id, { onDelete: "set null" }),
    clientBpId: uuid("client_bp_id").references(() => businessPartners.id, { onDelete: "set null" }),
    usageRights: text("usage_rights").notNull().default("internal"), // unrestricted | internal | client_only | licensed
    rightsNote: text("rights_note"),
    aiTagged: boolean("ai_tagged").notNull().default(false),
    embedded: boolean("embedded").notNull().default(false), // true once a vector was stored
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("content_assets_collection_idx").on(t.collectionId),
    index("content_assets_client_idx").on(t.clientBpId),
    index("content_assets_kind_idx").on(t.kind),
    uniqueIndex("content_assets_storage_path_uk").on(t.storageShare, t.storagePath),
  ],
);
export type ContentAsset = typeof contentAssets.$inferSelect;

// Usage history: where/when an asset was used (job linking + audit).
export const contentUsage = pgTable(
  "content_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id").notNull().references(() => contentAssets.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    context: text("context"), // free text, e.g. "Used on order SO-00123 front print"
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("content_usage_asset_idx").on(t.assetId), index("content_usage_order_idx").on(t.orderId)],
);
export type ContentUsage = typeof contentUsage.$inferSelect;
