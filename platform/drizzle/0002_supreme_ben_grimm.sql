CREATE TYPE "public"."lifecycle_stage" AS ENUM('lead', 'prospect', 'customer');--> statement-breakpoint
ALTER TABLE "business_partners" ADD COLUMN "lifecycle_stage" "lifecycle_stage" DEFAULT 'lead' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_partners" ADD COLUMN "lead_source" text;