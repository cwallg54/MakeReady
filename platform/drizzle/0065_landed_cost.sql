CREATE TABLE "landed_cost_docs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_number" text NOT NULL,
	"vendor" text,
	"shipment_ref" text,
	"freight_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"other_charges" numeric(14, 2) DEFAULT '0' NOT NULL,
	"other_label" text,
	"basis" text DEFAULT 'quantity' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"notes" text,
	"applied_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "landed_cost_docs_doc_number_unique" UNIQUE("doc_number")
);
--> statement-breakpoint
CREATE TABLE "landed_cost_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_id" uuid NOT NULL,
	"item_id" uuid,
	"sku" text,
	"description" text,
	"qty" numeric(14, 2) DEFAULT '0' NOT NULL,
	"base_unit_cost" numeric(14, 4) DEFAULT '0' NOT NULL,
	"allocated" numeric(14, 2) DEFAULT '0' NOT NULL,
	"landed_unit_cost" numeric(14, 4) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "landed_cost_docs" ADD CONSTRAINT "landed_cost_docs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landed_cost_lines" ADD CONSTRAINT "landed_cost_lines_doc_id_landed_cost_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."landed_cost_docs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landed_cost_lines" ADD CONSTRAINT "landed_cost_lines_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "landed_cost_docs_status_idx" ON "landed_cost_docs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "landed_cost_lines_doc_id_idx" ON "landed_cost_lines" USING btree ("doc_id");--> statement-breakpoint
CREATE INDEX "landed_cost_lines_item_id_idx" ON "landed_cost_lines" USING btree ("item_id");