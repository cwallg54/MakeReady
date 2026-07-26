CREATE TYPE "public"."production_status" AS ENUM('queued', 'in_production', 'quality_check', 'ready_to_ship', 'shipped');--> statement-breakpoint
CREATE TYPE "public"."stock_reason" AS ENUM('receive', 'consume', 'adjust', 'count');--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"unit" text DEFAULT 'each' NOT NULL,
	"supplier" text,
	"cost" numeric(12, 2) DEFAULT '0' NOT NULL,
	"on_hand" numeric(14, 2) DEFAULT '0' NOT NULL,
	"reorder_point" numeric(14, 2) DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_items_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "production_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"status" "production_status" DEFAULT 'queued' NOT NULL,
	"assigned_to" uuid,
	"rush" boolean DEFAULT false NOT NULL,
	"due_date" timestamp with time zone,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_jobs_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"delta" numeric(14, 2) DEFAULT '0' NOT NULL,
	"reason" "stock_reason" DEFAULT 'adjust' NOT NULL,
	"note" text,
	"by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "production_jobs" ADD CONSTRAINT "production_jobs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_jobs" ADD CONSTRAINT "production_jobs_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_jobs" ADD CONSTRAINT "production_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_by_user_id_users_id_fk" FOREIGN KEY ("by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_items_sku_idx" ON "inventory_items" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "production_jobs_status_idx" ON "production_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "production_jobs_assigned_to_idx" ON "production_jobs" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "stock_movements_item_id_idx" ON "stock_movements" USING btree ("item_id");