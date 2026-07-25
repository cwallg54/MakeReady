ALTER TABLE "order_form_templates" ADD COLUMN "default_markup_pct" numeric(6, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "template_items" ADD COLUMN "supplier_cost" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "template_items" ADD COLUMN "markup_pct" numeric(6, 2);