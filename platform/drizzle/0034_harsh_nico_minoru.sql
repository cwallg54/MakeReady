CREATE TABLE "design_barcodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"design_item_id" uuid,
	"design_number" text,
	"barcode_12" text,
	"barcode_10" text,
	"description" text,
	"cust_number" text,
	"cust_item_number" text,
	"customer_barcode" text,
	"cost" numeric(12, 2),
	"garment_type" text,
	"color" text,
	"size" text,
	"retail" text,
	"catalog" text DEFAULT 'g54' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "design_items" DROP CONSTRAINT "design_items_item_number_unique";--> statement-breakpoint
ALTER TABLE "design_items" ADD COLUMN "cust_number" text;--> statement-breakpoint
ALTER TABLE "design_items" ADD COLUMN "design_base" text;--> statement-breakpoint
ALTER TABLE "design_items" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "design_items" ADD COLUMN "catalog" text DEFAULT 'g54' NOT NULL;--> statement-breakpoint
ALTER TABLE "design_items" ADD COLUMN "printing" text;--> statement-breakpoint
ALTER TABLE "design_items" ADD COLUMN "royalty" text;--> statement-breakpoint
ALTER TABLE "design_items" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "design_items" ADD COLUMN "salesperson" text;--> statement-breakpoint
ALTER TABLE "design_items" ADD COLUMN "assignee_initials" text;--> statement-breakpoint
ALTER TABLE "design_items" ADD COLUMN "stitch_count" integer;--> statement-breakpoint
ALTER TABLE "design_items" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "design_items" ADD COLUMN "setup" text;--> statement-breakpoint
ALTER TABLE "design_items" ADD COLUMN "archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "design_items" ADD COLUMN "archive_tag" text;--> statement-breakpoint
ALTER TABLE "design_barcodes" ADD CONSTRAINT "design_barcodes_design_item_id_design_items_id_fk" FOREIGN KEY ("design_item_id") REFERENCES "public"."design_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "design_barcodes_design_idx" ON "design_barcodes" USING btree ("design_number");--> statement-breakpoint
CREATE INDEX "design_barcodes_item_idx" ON "design_barcodes" USING btree ("design_item_id");--> statement-breakpoint
CREATE INDEX "design_items_number_idx" ON "design_items" USING btree ("item_number");--> statement-breakpoint
CREATE INDEX "design_items_catalog_idx" ON "design_items" USING btree ("catalog");