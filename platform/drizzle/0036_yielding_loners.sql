CREATE TYPE "public"."store_visibility" AS ENUM('public', 'b2b', 'both');--> statement-breakpoint
CREATE TABLE "store_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "store_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inventory_item_id" uuid,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"category_id" uuid,
	"retail_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"b2b_price" numeric(12, 2),
	"visibility" "store_visibility" DEFAULT 'both' NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"taxable" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"image_base64" text,
	"image_mime_type" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_products_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_category_id_store_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."store_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "store_categories_slug_idx" ON "store_categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "store_products_slug_idx" ON "store_products" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "store_products_category_idx" ON "store_products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "store_products_inventory_idx" ON "store_products" USING btree ("inventory_item_id");