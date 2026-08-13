CREATE TABLE "pricing_extras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"kind" text DEFAULT 'fulfillment' NOT NULL,
	"amount" numeric(12, 4),
	"manual_quote" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_garments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"garment_number" text NOT NULL,
	"item_code" text,
	"cost" numeric(12, 4) DEFAULT '0' NOT NULL,
	"supplier" text,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pricing_garments_garment_number_unique" UNIQUE("garment_number")
);
--> statement-breakpoint
CREATE TABLE "pricing_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"config" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pricing_methods_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "pricing_royalties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"pct" numeric(6, 4) DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "pricing_royalties_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "pricing_vendor_freight" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor" text NOT NULL,
	"add_per_garment" numeric(12, 4),
	"free_over_cost" numeric(12, 2),
	"under_threshold" numeric(12, 2),
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX "pricing_garments_number_idx" ON "pricing_garments" USING btree ("garment_number");--> statement-breakpoint
CREATE INDEX "pricing_garments_supplier_idx" ON "pricing_garments" USING btree ("supplier");