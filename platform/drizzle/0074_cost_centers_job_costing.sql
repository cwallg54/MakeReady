CREATE TABLE "cost_center_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_cost_center_id" uuid NOT NULL,
	"to_cost_center_id" uuid NOT NULL,
	"pct" numeric(6, 3) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_centers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'department' NOT NULL,
	"labor_rate_per_hour" numeric(12, 2) DEFAULT '0' NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cost_centers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "job_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"order_id" uuid,
	"cost_center_id" uuid,
	"kind" text DEFAULT 'labor' NOT NULL,
	"description" text,
	"minutes" integer DEFAULT 0 NOT NULL,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cost_center_allocations" ADD CONSTRAINT "cost_center_allocations_from_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("from_cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_center_allocations" ADD CONSTRAINT "cost_center_allocations_to_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("to_cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_costs" ADD CONSTRAINT "job_costs_job_id_production_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."production_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_costs" ADD CONSTRAINT "job_costs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_costs" ADD CONSTRAINT "job_costs_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_costs" ADD CONSTRAINT "job_costs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cost_center_allocations_from_idx" ON "cost_center_allocations" USING btree ("from_cost_center_id");--> statement-breakpoint
CREATE INDEX "cost_centers_kind_idx" ON "cost_centers" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "job_costs_job_idx" ON "job_costs" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "job_costs_order_idx" ON "job_costs" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "job_costs_cc_idx" ON "job_costs" USING btree ("cost_center_id");