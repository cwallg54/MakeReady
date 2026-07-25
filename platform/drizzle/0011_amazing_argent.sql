CREATE TYPE "public"."customer_doc_status" AS ENUM('pending', 'completed');--> statement-breakpoint
CREATE TYPE "public"."customer_doc_type" AS ENUM('terms_application', 'credit_card_application');--> statement-breakpoint
CREATE TABLE "customer_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bp_id" uuid NOT NULL,
	"doc_type" "customer_doc_type" NOT NULL,
	"token" text NOT NULL,
	"status" "customer_doc_status" DEFAULT 'pending' NOT NULL,
	"data" jsonb,
	"signed_name" text,
	"submitted_at" timestamp with time zone,
	"ip" text,
	"requested_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_documents_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_bp_id_business_partners_id_fk" FOREIGN KEY ("bp_id") REFERENCES "public"."business_partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_documents_bp_id_idx" ON "customer_documents" USING btree ("bp_id");