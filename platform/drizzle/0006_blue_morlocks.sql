CREATE TYPE "public"."quote_status" AS ENUM('draft', 'sent', 'accepted', 'rejected', 'converted');--> statement-breakpoint
CREATE TABLE "order_form_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"size_options" text[],
	"charges" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_form_templates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "quote_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" text NOT NULL,
	"rate" numeric(12, 2) DEFAULT '0' NOT NULL,
	"input_qty" numeric(12, 2) DEFAULT '1' NOT NULL,
	"amount" numeric(12, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"item_code" text,
	"description" text NOT NULL,
	"qty" integer DEFAULT 0 NOT NULL,
	"unit_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"extended" numeric(12, 2) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_number" text NOT NULL,
	"bp_id" uuid,
	"template_id" uuid,
	"status" "quote_status" DEFAULT 'draft' NOT NULL,
	"is_reorder" boolean DEFAULT false NOT NULL,
	"discount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"charges_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotes_quote_number_unique" UNIQUE("quote_number")
);
--> statement-breakpoint
CREATE TABLE "template_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"unit_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quote_charges" ADD CONSTRAINT "quote_charges_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_bp_id_business_partners_id_fk" FOREIGN KEY ("bp_id") REFERENCES "public"."business_partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_template_id_order_form_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."order_form_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_items" ADD CONSTRAINT "template_items_template_id_order_form_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."order_form_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quote_charges_quote_id_idx" ON "quote_charges" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "quote_lines_quote_id_idx" ON "quote_lines" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "quotes_bp_id_idx" ON "quotes" USING btree ("bp_id");--> statement-breakpoint
CREATE INDEX "template_items_template_id_idx" ON "template_items" USING btree ("template_id");