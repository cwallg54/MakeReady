CREATE TYPE "public"."art_priority" AS ENUM('none', 'p2', 'p1');--> statement-breakpoint
CREATE TYPE "public"."art_production_type" AS ENUM('screen_print', 'embroidery', 'headwear', 'hard_goods', 'other');--> statement-breakpoint
CREATE TABLE "art_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"note" text,
	"minutes_spent" integer,
	"by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "art_requests" ADD COLUMN "priority" "art_priority" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "art_requests" ADD COLUMN "estimated_minutes" integer;--> statement-breakpoint
ALTER TABLE "art_requests" ADD COLUMN "production_type" "art_production_type";--> statement-breakpoint
ALTER TABLE "art_requests" ADD COLUMN "stitch_count" integer;--> statement-breakpoint
ALTER TABLE "art_requests" ADD COLUMN "separations_done" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "art_requests" ADD COLUMN "sourcing_type" text;--> statement-breakpoint
ALTER TABLE "art_requests" ADD COLUMN "supplier_notes" text;--> statement-breakpoint
ALTER TABLE "art_requests" ADD COLUMN "buyer_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "art_requests" ADD COLUMN "previous_design_ref" text;--> statement-breakpoint
ALTER TABLE "art_requests" ADD COLUMN "blank_item_ref" text;--> statement-breakpoint
ALTER TABLE "art_requests" ADD COLUMN "revision_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "art_requests" ADD COLUMN "production_ready_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "art_revisions" ADD CONSTRAINT "art_revisions_request_id_art_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."art_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "art_revisions" ADD CONSTRAINT "art_revisions_by_user_id_users_id_fk" FOREIGN KEY ("by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "art_revisions_request_idx" ON "art_revisions" USING btree ("request_id");