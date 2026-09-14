CREATE TYPE "public"."fiscal_status" AS ENUM('open', 'closing', 'locked');--> statement-breakpoint
CREATE TYPE "public"."gl_segment_kind" AS ENUM('product_line', 'department', 'overhead', 'none');--> statement-breakpoint
CREATE TABLE "fiscal_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fiscal_year_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"period_number" integer NOT NULL,
	"quarter" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "fiscal_status" DEFAULT 'open' NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	CONSTRAINT "fiscal_periods_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "fiscal_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "fiscal_status" DEFAULT 'open' NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fiscal_years_year_unique" UNIQUE("year")
);
--> statement-breakpoint
CREATE TABLE "gl_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text DEFAULT '' NOT NULL,
	"kind" "gl_segment_kind" DEFAULT 'none' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "gl_segments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "gl_accounts" ADD COLUMN "natural_code" text;--> statement-breakpoint
ALTER TABLE "gl_accounts" ADD COLUMN "segment_id" uuid;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "period_id" uuid;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "auto_reverse_on" date;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "reverses_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD COLUMN "bp_id" uuid;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD COLUMN "segment_id" uuid;--> statement-breakpoint
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_fiscal_year_id_fiscal_years_id_fk" FOREIGN KEY ("fiscal_year_id") REFERENCES "public"."fiscal_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_years" ADD CONSTRAINT "fiscal_years_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fiscal_periods_year_num_uk" ON "fiscal_periods" USING btree ("fiscal_year_id","period_number");--> statement-breakpoint
CREATE INDEX "fiscal_periods_dates_idx" ON "fiscal_periods" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX "fiscal_years_year_idx" ON "fiscal_years" USING btree ("year");--> statement-breakpoint
CREATE INDEX "gl_segments_kind_idx" ON "gl_segments" USING btree ("kind");--> statement-breakpoint
ALTER TABLE "gl_accounts" ADD CONSTRAINT "gl_accounts_segment_id_gl_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."gl_segments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_period_id_fiscal_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."fiscal_periods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_bp_id_business_partners_id_fk" FOREIGN KEY ("bp_id") REFERENCES "public"."business_partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_segment_id_gl_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."gl_segments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gl_accounts_natural_idx" ON "gl_accounts" USING btree ("natural_code");--> statement-breakpoint
CREATE INDEX "gl_accounts_segment_idx" ON "gl_accounts" USING btree ("segment_id");--> statement-breakpoint
CREATE INDEX "journal_entries_period_idx" ON "journal_entries" USING btree ("period_id");--> statement-breakpoint
CREATE INDEX "journal_lines_bp_idx" ON "journal_lines" USING btree ("bp_id");--> statement-breakpoint
CREATE INDEX "journal_lines_segment_idx" ON "journal_lines" USING btree ("segment_id");