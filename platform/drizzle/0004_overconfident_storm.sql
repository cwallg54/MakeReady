CREATE TYPE "public"."address_type" AS ENUM('billing', 'shipping', 'other');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('open', 'done');--> statement-breakpoint
CREATE TABLE "bp_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bp_id" uuid NOT NULL,
	"type" "address_type" DEFAULT 'shipping' NOT NULL,
	"label" text,
	"street" text,
	"city" text,
	"state" text,
	"zip" text,
	"country" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bp_id" uuid NOT NULL,
	"title" text NOT NULL,
	"due_date" timestamp with time zone,
	"status" "task_status" DEFAULT 'open' NOT NULL,
	"assigned_to_id" uuid,
	"created_by_id" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_partners" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "business_partners" ADD COLUMN "tags" text[];--> statement-breakpoint
ALTER TABLE "bp_addresses" ADD CONSTRAINT "bp_addresses_bp_id_business_partners_id_fk" FOREIGN KEY ("bp_id") REFERENCES "public"."business_partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_bp_id_business_partners_id_fk" FOREIGN KEY ("bp_id") REFERENCES "public"."business_partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bp_addresses_bp_id_idx" ON "bp_addresses" USING btree ("bp_id");--> statement-breakpoint
CREATE INDEX "crm_tasks_bp_id_idx" ON "crm_tasks" USING btree ("bp_id");--> statement-breakpoint
CREATE INDEX "crm_tasks_assigned_idx" ON "crm_tasks" USING btree ("assigned_to_id");--> statement-breakpoint
ALTER TABLE "business_partners" ADD CONSTRAINT "business_partners_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;