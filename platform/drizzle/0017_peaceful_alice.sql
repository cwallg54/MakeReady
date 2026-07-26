CREATE TYPE "public"."art_status" AS ENUM('todo', 'in_progress', 'proofing', 'revisions', 'approved', 'done');--> statement-breakpoint
ALTER TYPE "public"."proof_status" ADD VALUE 'meeting_requested';--> statement-breakpoint
CREATE TABLE "art_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"status" "art_status" DEFAULT 'todo' NOT NULL,
	"assigned_to" uuid,
	"rush" boolean DEFAULT false NOT NULL,
	"due_date" timestamp with time zone,
	"brief" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "art_requests_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
ALTER TABLE "template_items" ADD COLUMN "image_base64" text;--> statement-breakpoint
ALTER TABLE "template_items" ADD COLUMN "image_mime_type" text;--> statement-breakpoint
ALTER TABLE "art_requests" ADD CONSTRAINT "art_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "art_requests" ADD CONSTRAINT "art_requests_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "art_requests" ADD CONSTRAINT "art_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "art_requests_status_idx" ON "art_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "art_requests_assigned_to_idx" ON "art_requests" USING btree ("assigned_to");