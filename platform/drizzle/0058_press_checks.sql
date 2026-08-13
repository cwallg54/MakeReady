CREATE TYPE "public"."press_check_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "press_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"photo_attachment_id" uuid,
	"status" "press_check_status" DEFAULT 'pending' NOT NULL,
	"submitted_by" uuid,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "production_jobs" ADD COLUMN "press_check_required" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "press_checks" ADD CONSTRAINT "press_checks_job_id_production_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."production_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "press_checks" ADD CONSTRAINT "press_checks_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "press_checks" ADD CONSTRAINT "press_checks_photo_attachment_id_order_attachments_id_fk" FOREIGN KEY ("photo_attachment_id") REFERENCES "public"."order_attachments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "press_checks" ADD CONSTRAINT "press_checks_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "press_checks" ADD CONSTRAINT "press_checks_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "press_checks_job_id_idx" ON "press_checks" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "press_checks_status_idx" ON "press_checks" USING btree ("status");