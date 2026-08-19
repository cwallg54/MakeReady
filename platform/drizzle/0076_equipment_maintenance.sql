CREATE TABLE "equipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'press' NOT NULL,
	"location" text,
	"serial_number" text,
	"cost_center_id" uuid,
	"purchase_date" timestamp with time zone,
	"status" text DEFAULT 'operational' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "maintenance_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"equipment_id" uuid NOT NULL,
	"task" text NOT NULL,
	"interval_days" integer DEFAULT 30 NOT NULL,
	"last_done_date" timestamp with time zone,
	"next_due_date" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_work_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wo_number" text NOT NULL,
	"equipment_id" uuid NOT NULL,
	"schedule_id" uuid,
	"type" text DEFAULT 'repair' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"description" text,
	"assigned_to" uuid,
	"scheduled_date" timestamp with time zone,
	"completed_date" timestamp with time zone,
	"downtime_minutes" integer DEFAULT 0 NOT NULL,
	"cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"resolution" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maintenance_work_orders_wo_number_unique" UNIQUE("wo_number")
);
--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_work_orders" ADD CONSTRAINT "maintenance_work_orders_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_work_orders" ADD CONSTRAINT "maintenance_work_orders_schedule_id_maintenance_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."maintenance_schedules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_work_orders" ADD CONSTRAINT "maintenance_work_orders_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_work_orders" ADD CONSTRAINT "maintenance_work_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "equipment_status_idx" ON "equipment" USING btree ("status");--> statement-breakpoint
CREATE INDEX "equipment_type_idx" ON "equipment" USING btree ("type");--> statement-breakpoint
CREATE INDEX "maintenance_schedules_equipment_idx" ON "maintenance_schedules" USING btree ("equipment_id");--> statement-breakpoint
CREATE INDEX "maintenance_schedules_due_idx" ON "maintenance_schedules" USING btree ("next_due_date");--> statement-breakpoint
CREATE INDEX "maintenance_wo_equipment_idx" ON "maintenance_work_orders" USING btree ("equipment_id");--> statement-breakpoint
CREATE INDEX "maintenance_wo_status_idx" ON "maintenance_work_orders" USING btree ("status");