CREATE TYPE "public"."store_promo_kind" AS ENUM('percent', 'fixed');--> statement-breakpoint
CREATE TABLE "store_promos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"kind" "store_promo_kind" DEFAULT 'percent' NOT NULL,
	"value" numeric(12, 2) DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"min_subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"expires_at" timestamp with time zone,
	"usage_limit" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_promos_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "store_orders" ADD COLUMN "discount" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "store_orders" ADD COLUMN "promo_code" text;--> statement-breakpoint
CREATE INDEX "store_promos_code_idx" ON "store_promos" USING btree ("code");