CREATE TABLE "depreciation_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "depreciation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_number" text NOT NULL,
	"period_ym" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"total_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"journal_entry_id" uuid,
	"posted_at" timestamp with time zone,
	"posted_by" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "depreciation_runs_run_number_unique" UNIQUE("run_number")
);
--> statement-breakpoint
CREATE TABLE "fixed_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_number" text NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'equipment' NOT NULL,
	"description" text,
	"acquisition_date" timestamp with time zone,
	"in_service_date" timestamp with time zone,
	"cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"salvage_value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"useful_life_months" integer DEFAULT 60 NOT NULL,
	"method" text DEFAULT 'straight_line' NOT NULL,
	"accumulated_depreciation" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"disposed_date" timestamp with time zone,
	"disposal_proceeds" numeric(14, 2),
	"disposal_note" text,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fixed_assets_asset_number_unique" UNIQUE("asset_number")
);
--> statement-breakpoint
ALTER TABLE "depreciation_lines" ADD CONSTRAINT "depreciation_lines_run_id_depreciation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."depreciation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depreciation_lines" ADD CONSTRAINT "depreciation_lines_asset_id_fixed_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."fixed_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depreciation_runs" ADD CONSTRAINT "depreciation_runs_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depreciation_runs" ADD CONSTRAINT "depreciation_runs_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depreciation_runs" ADD CONSTRAINT "depreciation_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "depreciation_lines_run_idx" ON "depreciation_lines" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "depreciation_lines_asset_idx" ON "depreciation_lines" USING btree ("asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "depreciation_runs_period_uk" ON "depreciation_runs" USING btree ("period_ym");--> statement-breakpoint
CREATE INDEX "depreciation_runs_status_idx" ON "depreciation_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "fixed_assets_status_idx" ON "fixed_assets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "fixed_assets_category_idx" ON "fixed_assets" USING btree ("category");