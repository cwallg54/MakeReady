ALTER TABLE "invoices" ADD COLUMN "reminders_sent" jsonb;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "late_fee_pct" numeric(6, 3) DEFAULT '1.5' NOT NULL;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "late_fee_days" integer DEFAULT 15 NOT NULL;