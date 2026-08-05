CREATE TABLE "store_customer_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"discount_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_customer_groups_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "store_customers" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "store_customers" ADD CONSTRAINT "store_customers_group_id_store_customer_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."store_customer_groups"("id") ON DELETE set null ON UPDATE no action;