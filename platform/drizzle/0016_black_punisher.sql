ALTER TABLE "quote_lines" ADD COLUMN "size" text;--> statement-breakpoint
ALTER TABLE "template_items" ADD COLUMN "price_breaks" jsonb;--> statement-breakpoint
ALTER TABLE "template_items" ADD COLUMN "min_qty" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "template_items" ADD COLUMN "size_upcharges" jsonb;