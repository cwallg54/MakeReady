CREATE TABLE "production_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"item_id" uuid,
	"sku" text,
	"description" text,
	"qty" numeric(14, 2) DEFAULT '0' NOT NULL,
	"bin_id" uuid,
	"unit_cost" numeric(14, 4) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_number" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"added_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"posted_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_orders_doc_number_unique" UNIQUE("doc_number")
);
--> statement-breakpoint
ALTER TABLE "production_order_lines" ADD CONSTRAINT "production_order_lines_doc_id_production_orders_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."production_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_lines" ADD CONSTRAINT "production_order_lines_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_lines" ADD CONSTRAINT "production_order_lines_bin_id_bins_id_fk" FOREIGN KEY ("bin_id") REFERENCES "public"."bins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "production_order_lines_doc_id_idx" ON "production_order_lines" USING btree ("doc_id");--> statement-breakpoint
CREATE INDEX "production_orders_status_idx" ON "production_orders" USING btree ("status");