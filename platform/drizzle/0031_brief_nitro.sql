ALTER TABLE "customer_documents" ADD COLUMN "chased_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customer_documents" ADD COLUMN "chase_count" integer DEFAULT 0 NOT NULL;