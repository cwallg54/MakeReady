ALTER TABLE "business_partners" ADD COLUMN "territory" text;--> statement-breakpoint
ALTER TABLE "business_partners" ADD COLUMN "credit_hold" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "business_partners" ADD COLUMN "credit_hold_reason" text;--> statement-breakpoint
ALTER TABLE "business_partners" ADD COLUMN "personal_guarantee" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "business_partners" ADD COLUMN "price_list" text;--> statement-breakpoint
ALTER TABLE "business_partners" ADD COLUMN "softgood_price_level" text;--> statement-breakpoint
ALTER TABLE "business_partners" ADD COLUMN "shipping_type" text;--> statement-breakpoint
ALTER TABLE "business_partners" ADD COLUMN "customer_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "business_partners" ADD COLUMN "parent_bp_number" text;--> statement-breakpoint
ALTER TABLE "business_partners" ADD COLUMN "historical_apa" integer;--> statement-breakpoint
ALTER TABLE "business_partners" ADD COLUMN "two_year_apa" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "order_type" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "po_number" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "ship_via" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "date_type" text DEFAULT 'ASAP' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "due_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "amount" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "sales_rep_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_sales_rep_id_users_id_fk" FOREIGN KEY ("sales_rep_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Backfill existing orders so the standard reports show meaningful data.
UPDATE "orders" o SET "amount" = q."total" FROM "quotes" q WHERE q."id" = o."quote_id" AND o."amount" = '0';--> statement-breakpoint
UPDATE "orders" o SET "due_date" = o."in_hands_date" WHERE o."due_date" IS NULL AND o."in_hands_date" IS NOT NULL;--> statement-breakpoint
UPDATE "orders" o SET "sales_rep_id" = COALESCE(bp."owner_id", o."created_by") FROM "business_partners" bp WHERE bp."id" = o."bp_id" AND o."sales_rep_id" IS NULL;--> statement-breakpoint
-- Seed customer_since from the earliest historical/known order date per account.
UPDATE "business_partners" bp SET "customer_since" = sub."first_date" FROM (SELECT "bp_id", MIN("doc_date") AS "first_date" FROM "historical_orders" GROUP BY "bp_id") sub WHERE sub."bp_id" = bp."id" AND bp."customer_since" IS NULL;