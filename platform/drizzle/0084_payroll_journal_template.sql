CREATE TYPE "public"."payroll_run_kind" AS ENUM('payroll', 'accrual');--> statement-breakpoint
CREATE TYPE "public"."payroll_run_status" AS ENUM('draft', 'posted', 'void');--> statement-breakpoint
CREATE TABLE "payroll_run_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"label" text NOT NULL,
	"side" text DEFAULT 'debit' NOT NULL,
	"grouping" text,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_number" text NOT NULL,
	"template_id" uuid,
	"kind" "payroll_run_kind" DEFAULT 'payroll' NOT NULL,
	"pay_date" date NOT NULL,
	"period_start" date,
	"period_end" date,
	"accrual_date" date,
	"status" "payroll_run_status" DEFAULT 'draft' NOT NULL,
	"total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"journal_entry_id" uuid,
	"notes" text,
	"created_by" uuid,
	"posted_by" uuid,
	"posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_runs_run_number_unique" UNIQUE("run_number")
);
--> statement-breakpoint
CREATE TABLE "payroll_template_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"label" text NOT NULL,
	"side" text DEFAULT 'debit' NOT NULL,
	"grouping" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payroll_run_lines" ADD CONSTRAINT "payroll_run_lines_run_id_payroll_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_run_lines" ADD CONSTRAINT "payroll_run_lines_account_id_gl_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."gl_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_template_id_payroll_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."payroll_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_template_lines" ADD CONSTRAINT "payroll_template_lines_template_id_payroll_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."payroll_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_template_lines" ADD CONSTRAINT "payroll_template_lines_account_id_gl_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."gl_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_templates" ADD CONSTRAINT "payroll_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payroll_run_lines_run_idx" ON "payroll_run_lines" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "payroll_runs_status_idx" ON "payroll_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payroll_runs_date_idx" ON "payroll_runs" USING btree ("pay_date");--> statement-breakpoint
CREATE INDEX "payroll_template_lines_template_idx" ON "payroll_template_lines" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "payroll_templates_active_idx" ON "payroll_templates" USING btree ("active");