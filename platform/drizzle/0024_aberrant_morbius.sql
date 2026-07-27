CREATE TABLE "historical_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bp_id" uuid NOT NULL,
	"doc_num" text NOT NULL,
	"doc_date" timestamp with time zone NOT NULL,
	"doc_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"doc_status" text,
	"canceled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "historical_orders" ADD CONSTRAINT "historical_orders_bp_id_business_partners_id_fk" FOREIGN KEY ("bp_id") REFERENCES "public"."business_partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "historical_orders_bp_id_idx" ON "historical_orders" USING btree ("bp_id");--> statement-breakpoint
CREATE INDEX "historical_orders_bp_date_idx" ON "historical_orders" USING btree ("bp_id","doc_date");