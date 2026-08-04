CREATE TYPE "public"."customer_attachment_kind" AS ENUM('experian', 'tax_exempt', 'credit_app', 'address_change', 'credit_increase', 'other');--> statement-breakpoint
CREATE TABLE "customer_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bp_id" uuid NOT NULL,
	"kind" "customer_attachment_kind" DEFAULT 'other' NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text DEFAULT 'application/pdf' NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"content_base64" text NOT NULL,
	"notes" text,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "territory" text;--> statement-breakpoint
ALTER TABLE "customer_attachments" ADD CONSTRAINT "customer_attachments_bp_id_business_partners_id_fk" FOREIGN KEY ("bp_id") REFERENCES "public"."business_partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_attachments" ADD CONSTRAINT "customer_attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_attachments_bp_id_idx" ON "customer_attachments" USING btree ("bp_id");