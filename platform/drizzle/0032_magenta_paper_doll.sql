CREATE TYPE "public"."credit_request_reason" AS ENUM('hold', 'over_limit');--> statement-breakpoint
CREATE TYPE "public"."credit_request_status" AS ENUM('pending', 'approved', 'denied');--> statement-breakpoint
CREATE TABLE "credit_approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid,
	"bp_id" uuid,
	"reason" "credit_request_reason" NOT NULL,
	"status" "credit_request_status" DEFAULT 'pending' NOT NULL,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"account_balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"credit_limit" numeric(14, 2),
	"amount_over" numeric(14, 2) DEFAULT '0' NOT NULL,
	"decision_note" text,
	"new_limit" numeric(14, 2),
	"requested_by" uuid,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "lead_time_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "is_import" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "credit_approval_threshold" numeric(14, 2) DEFAULT '5000' NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_approval_requests" ADD CONSTRAINT "credit_approval_requests_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_approval_requests" ADD CONSTRAINT "credit_approval_requests_bp_id_business_partners_id_fk" FOREIGN KEY ("bp_id") REFERENCES "public"."business_partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_approval_requests" ADD CONSTRAINT "credit_approval_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_approval_requests" ADD CONSTRAINT "credit_approval_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_requests_status_idx" ON "credit_approval_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "credit_requests_bp_idx" ON "credit_approval_requests" USING btree ("bp_id");