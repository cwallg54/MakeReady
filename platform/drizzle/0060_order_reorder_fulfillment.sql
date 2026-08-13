ALTER TABLE "orders" ADD COLUMN "is_reorder" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "needs_barcode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "needs_hangtag" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "needs_folding" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "name_drop" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "upc_by_size" jsonb;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fulfillment_notes" text;