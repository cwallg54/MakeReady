CREATE TYPE "public"."automation_action" AS ENUM('create_task', 'notify_owner', 'email_customer');--> statement-breakpoint
CREATE TYPE "public"."automation_trigger" AS ENUM('lead_created', 'manual');--> statement-breakpoint
CREATE TYPE "public"."enrollment_status" AS ENUM('active', 'completed', 'stopped');--> statement-breakpoint
CREATE TABLE "automation_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"trigger" "automation_trigger" DEFAULT 'manual' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"bp_id" uuid NOT NULL,
	"status" "enrollment_status" DEFAULT 'active' NOT NULL,
	"next_step_index" integer DEFAULT 0 NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"day_offset" integer DEFAULT 0 NOT NULL,
	"action_type" "automation_action" NOT NULL,
	"task_title" text,
	"due_days" integer DEFAULT 0 NOT NULL,
	"notify_message" text,
	"email_subject" text,
	"email_body" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "automation_enrollments" ADD CONSTRAINT "automation_enrollments_campaign_id_automation_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."automation_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_enrollments" ADD CONSTRAINT "automation_enrollments_bp_id_business_partners_id_fk" FOREIGN KEY ("bp_id") REFERENCES "public"."business_partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_steps" ADD CONSTRAINT "automation_steps_campaign_id_automation_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."automation_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_enrollments_due_idx" ON "automation_enrollments" USING btree ("status","next_run_at");--> statement-breakpoint
CREATE INDEX "automation_steps_campaign_idx" ON "automation_steps" USING btree ("campaign_id");