CREATE TABLE "report_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_key" text NOT NULL,
	"config" jsonb,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_settings_report_key_unique" UNIQUE("report_key")
);
--> statement-breakpoint
ALTER TABLE "report_settings" ADD CONSTRAINT "report_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;