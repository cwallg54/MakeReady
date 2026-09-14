CREATE TYPE "public"."ar_application_source" AS ENUM('payment', 'credit_memo');--> statement-breakpoint
CREATE TYPE "public"."credit_memo_status" AS ENUM('draft', 'open', 'applied', 'void');--> statement-breakpoint
CREATE TYPE "public"."deposit_status" AS ENUM('open', 'deposited', 'void');--> statement-breakpoint
CREATE TABLE "ar_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"source" "ar_application_source" NOT NULL,
	"payment_id" uuid,
	"credit_memo_id" uuid,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"applied_on" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "credit_memo_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memo_id" uuid NOT NULL,
	"description" text NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(14, 2) DEFAULT '0' NOT NULL,
	"extended" numeric(14, 2) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_memos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memo_number" text NOT NULL,
	"bp_id" uuid,
	"invoice_id" uuid,
	"status" "credit_memo_status" DEFAULT 'draft' NOT NULL,
	"issue_date" timestamp with time zone,
	"reason" text,
	"subtotal" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tax_rate" numeric(6, 4) DEFAULT '0' NOT NULL,
	"tax" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_memos_memo_number_unique" UNIQUE("memo_number")
);
--> statement-breakpoint
CREATE TABLE "deposits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deposit_number" text NOT NULL,
	"deposit_date" timestamp with time zone DEFAULT now() NOT NULL,
	"bank_account_id" uuid,
	"method" "payment_method" DEFAULT 'check' NOT NULL,
	"reference" text,
	"total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" "deposit_status" DEFAULT 'open' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deposits_deposit_number_unique" UNIQUE("deposit_number")
);
--> statement-breakpoint
CREATE TABLE "payment_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"net_days" integer DEFAULT 0 NOT NULL,
	"discount_pct" numeric(6, 3) DEFAULT '0' NOT NULL,
	"discount_days" integer DEFAULT 0 NOT NULL,
	"card_on_file" boolean DEFAULT false NOT NULL,
	"prepay" boolean DEFAULT false NOT NULL,
	"credit_allowed" boolean DEFAULT true NOT NULL,
	"status_note" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "payment_terms_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "business_partners" ADD COLUMN "parent_bp_id" uuid;--> statement-breakpoint
ALTER TABLE "business_partners" ADD COLUMN "terms_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "terms_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "card_charged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "card_charge_note" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "deposit_id" uuid;--> statement-breakpoint
ALTER TABLE "ar_applications" ADD CONSTRAINT "ar_applications_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ar_applications" ADD CONSTRAINT "ar_applications_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ar_applications" ADD CONSTRAINT "ar_applications_credit_memo_id_credit_memos_id_fk" FOREIGN KEY ("credit_memo_id") REFERENCES "public"."credit_memos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ar_applications" ADD CONSTRAINT "ar_applications_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_memo_lines" ADD CONSTRAINT "credit_memo_lines_memo_id_credit_memos_id_fk" FOREIGN KEY ("memo_id") REFERENCES "public"."credit_memos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_memos" ADD CONSTRAINT "credit_memos_bp_id_business_partners_id_fk" FOREIGN KEY ("bp_id") REFERENCES "public"."business_partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_memos" ADD CONSTRAINT "credit_memos_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_memos" ADD CONSTRAINT "credit_memos_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_bank_account_id_gl_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."gl_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ar_applications_invoice_idx" ON "ar_applications" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "ar_applications_payment_idx" ON "ar_applications" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "ar_applications_memo_idx" ON "ar_applications" USING btree ("credit_memo_id");--> statement-breakpoint
CREATE INDEX "credit_memo_lines_memo_idx" ON "credit_memo_lines" USING btree ("memo_id");--> statement-breakpoint
CREATE INDEX "credit_memos_bp_idx" ON "credit_memos" USING btree ("bp_id");--> statement-breakpoint
CREATE INDEX "credit_memos_status_idx" ON "credit_memos" USING btree ("status");--> statement-breakpoint
CREATE INDEX "deposits_status_idx" ON "deposits" USING btree ("status");--> statement-breakpoint
CREATE INDEX "deposits_date_idx" ON "deposits" USING btree ("deposit_date");--> statement-breakpoint
CREATE INDEX "payment_terms_active_idx" ON "payment_terms" USING btree ("active");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_terms_id_payment_terms_id_fk" FOREIGN KEY ("terms_id") REFERENCES "public"."payment_terms"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "business_partners" ADD CONSTRAINT "business_partners_parent_bp_id_fk" FOREIGN KEY ("parent_bp_id") REFERENCES "public"."business_partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_partners" ADD CONSTRAINT "business_partners_terms_id_fk" FOREIGN KEY ("terms_id") REFERENCES "public"."payment_terms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_deposit_id_fk" FOREIGN KEY ("deposit_id") REFERENCES "public"."deposits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bp_parent_idx" ON "business_partners" USING btree ("parent_bp_id");--> statement-breakpoint
CREATE INDEX "payments_deposit_idx" ON "payments" USING btree ("deposit_id");
