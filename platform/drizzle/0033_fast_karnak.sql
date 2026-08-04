CREATE TYPE "public"."design_item_status" AS ENUM('draft', 'active', 'retired');--> statement-breakpoint
CREATE TABLE "base_designs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"base_number" text NOT NULL,
	"name" text NOT NULL,
	"brand_code" text DEFAULT 'G54' NOT NULL,
	"release_year" integer,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "base_designs_base_number_unique" UNIQUE("base_number")
);
--> statement-breakpoint
CREATE TABLE "design_brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_legacy" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "design_brands_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "design_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_number" text NOT NULL,
	"base_design_id" uuid,
	"brand_code" text DEFAULT 'G54' NOT NULL,
	"bp_id" uuid,
	"suffix" text,
	"color_variant" text,
	"barcode_number" text,
	"barcode_source" text DEFAULT 'gmw' NOT NULL,
	"image_base64" text,
	"image_mime_type" text,
	"status" "design_item_status" DEFAULT 'draft' NOT NULL,
	"is_exception" boolean DEFAULT false NOT NULL,
	"exception_reason" text,
	"inventory_item_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "design_items_item_number_unique" UNIQUE("item_number")
);
--> statement-breakpoint
CREATE TABLE "design_suffixes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"kind" text DEFAULT 'product' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "design_suffixes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "image_base64" text;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "image_mime_type" text;--> statement-breakpoint
ALTER TABLE "base_designs" ADD CONSTRAINT "base_designs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_items" ADD CONSTRAINT "design_items_base_design_id_base_designs_id_fk" FOREIGN KEY ("base_design_id") REFERENCES "public"."base_designs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_items" ADD CONSTRAINT "design_items_bp_id_business_partners_id_fk" FOREIGN KEY ("bp_id") REFERENCES "public"."business_partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_items" ADD CONSTRAINT "design_items_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_items" ADD CONSTRAINT "design_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "base_designs_name_idx" ON "base_designs" USING btree ("name");--> statement-breakpoint
CREATE INDEX "design_items_base_idx" ON "design_items" USING btree ("base_design_id");--> statement-breakpoint
CREATE INDEX "design_items_bp_idx" ON "design_items" USING btree ("bp_id");