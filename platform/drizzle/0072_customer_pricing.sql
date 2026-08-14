CREATE TABLE "customer_pricing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bp_id" uuid NOT NULL,
	"style_id" uuid,
	"type" text NOT NULL,
	"value" numeric(12, 4) DEFAULT '0' NOT NULL,
	"note" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_pricing" ADD CONSTRAINT "customer_pricing_bp_id_business_partners_id_fk" FOREIGN KEY ("bp_id") REFERENCES "public"."business_partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_pricing" ADD CONSTRAINT "customer_pricing_style_id_catalog_styles_id_fk" FOREIGN KEY ("style_id") REFERENCES "public"."catalog_styles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_pricing" ADD CONSTRAINT "customer_pricing_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_pricing_bp_idx" ON "customer_pricing" USING btree ("bp_id");