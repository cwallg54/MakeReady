CREATE TABLE "catalog_colors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"style_id" uuid NOT NULL,
	"name" text NOT NULL,
	"tier_code" text,
	"hex" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_styles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand" text,
	"style_number" text,
	"name" text NOT NULL,
	"description" text,
	"category" text,
	"size_class_code" text,
	"base_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"supplier_cost" numeric(12, 2),
	"image_base64" text,
	"image_mime_type" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "color_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "color_tiers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "decoration_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"price_mode" text DEFAULT 'per_color' NOT NULL,
	"pricing" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "decoration_methods_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "embroidery_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"max_stitches" integer DEFAULT 0 NOT NULL,
	"price_per_unit" numeric(12, 2) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "embroidery_tiers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "print_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "print_locations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "size_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"sizes" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "size_classes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "quote_lines" ADD COLUMN "style_id" uuid;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD COLUMN "color_tier" text;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD COLUMN "size_breakdown" jsonb;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD COLUMN "decorations" jsonb;--> statement-breakpoint
ALTER TABLE "catalog_colors" ADD CONSTRAINT "catalog_colors_style_id_catalog_styles_id_fk" FOREIGN KEY ("style_id") REFERENCES "public"."catalog_styles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_colors_style_id_idx" ON "catalog_colors" USING btree ("style_id");--> statement-breakpoint
CREATE INDEX "catalog_styles_name_idx" ON "catalog_styles" USING btree ("name");--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_style_id_catalog_styles_id_fk" FOREIGN KEY ("style_id") REFERENCES "public"."catalog_styles"("id") ON DELETE set null ON UPDATE no action;