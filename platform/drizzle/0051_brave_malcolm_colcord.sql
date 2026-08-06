ALTER TABLE "invoices" ADD COLUMN "tax_rate" numeric(6, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "tax" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "default_tax_rate" numeric(6, 4) DEFAULT '0' NOT NULL;