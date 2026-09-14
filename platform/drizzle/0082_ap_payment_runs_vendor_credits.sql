CREATE TYPE "public"."payment_run_status" AS ENUM('draft', 'approved', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."vendor_credit_status" AS ENUM('draft', 'open', 'applied', 'void');--> statement-breakpoint
CREATE TABLE "payment_run_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"bill_id" uuid,
	"vendor_id" uuid,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"instrument_number" text,
	"included" boolean DEFAULT true NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "payment_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_number" text NOT NULL,
	"run_date" timestamp with time zone DEFAULT now() NOT NULL,
	"due_through" date,
	"method" "payment_method" DEFAULT 'ach' NOT NULL,
	"bank_account_id" uuid,
	"status" "payment_run_status" DEFAULT 'draft' NOT NULL,
	"first_check_number" integer,
	"total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_runs_run_number_unique" UNIQUE("run_number")
);
--> statement-breakpoint
CREATE TABLE "vendor_credit_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"credit_id" uuid NOT NULL,
	"bill_id" uuid NOT NULL,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"applied_on" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "vendor_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"credit_number" text NOT NULL,
	"vendor_id" uuid,
	"bill_id" uuid,
	"vendor_ref" text,
	"status" "vendor_credit_status" DEFAULT 'draft' NOT NULL,
	"issue_date" timestamp with time zone,
	"reason" text,
	"account_id" uuid,
	"total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_credits_credit_number_unique" UNIQUE("credit_number")
);
--> statement-breakpoint
ALTER TABLE "bill_payments" ADD COLUMN "run_id" uuid;--> statement-breakpoint
ALTER TABLE "bill_payments" ADD COLUMN "instrument_number" text;--> statement-breakpoint
ALTER TABLE "payment_run_lines" ADD CONSTRAINT "payment_run_lines_run_id_payment_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."payment_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_run_lines" ADD CONSTRAINT "payment_run_lines_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_run_lines" ADD CONSTRAINT "payment_run_lines_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_runs" ADD CONSTRAINT "payment_runs_bank_account_id_gl_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."gl_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_runs" ADD CONSTRAINT "payment_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_runs" ADD CONSTRAINT "payment_runs_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_credit_applications" ADD CONSTRAINT "vendor_credit_applications_credit_id_vendor_credits_id_fk" FOREIGN KEY ("credit_id") REFERENCES "public"."vendor_credits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_credit_applications" ADD CONSTRAINT "vendor_credit_applications_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_credit_applications" ADD CONSTRAINT "vendor_credit_applications_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_credits" ADD CONSTRAINT "vendor_credits_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_credits" ADD CONSTRAINT "vendor_credits_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_credits" ADD CONSTRAINT "vendor_credits_account_id_gl_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."gl_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_credits" ADD CONSTRAINT "vendor_credits_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_run_lines_run_idx" ON "payment_run_lines" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "payment_run_lines_bill_idx" ON "payment_run_lines" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "payment_runs_status_idx" ON "payment_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payment_runs_date_idx" ON "payment_runs" USING btree ("run_date");--> statement-breakpoint
CREATE INDEX "vendor_credit_apps_credit_idx" ON "vendor_credit_applications" USING btree ("credit_id");--> statement-breakpoint
CREATE INDEX "vendor_credit_apps_bill_idx" ON "vendor_credit_applications" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "vendor_credits_vendor_idx" ON "vendor_credits" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "vendor_credits_status_idx" ON "vendor_credits" USING btree ("status");
--> statement-breakpoint
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."payment_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bill_payments_run_idx" ON "bill_payments" USING btree ("run_id");
