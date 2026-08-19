CREATE TABLE "quality_defects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inspection_id" uuid NOT NULL,
	"defect_type" text DEFAULT 'other' NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "quality_inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inspection_number" text NOT NULL,
	"job_id" uuid,
	"order_id" uuid,
	"stage" text DEFAULT 'final' NOT NULL,
	"result" text DEFAULT 'pass' NOT NULL,
	"qty_inspected" integer DEFAULT 0 NOT NULL,
	"qty_rejected" integer DEFAULT 0 NOT NULL,
	"inspector_id" uuid,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quality_inspections_inspection_number_unique" UNIQUE("inspection_number")
);
--> statement-breakpoint
ALTER TABLE "quality_defects" ADD CONSTRAINT "quality_defects_inspection_id_quality_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."quality_inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_job_id_production_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."production_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_inspector_id_users_id_fk" FOREIGN KEY ("inspector_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quality_defects_inspection_idx" ON "quality_defects" USING btree ("inspection_id");--> statement-breakpoint
CREATE INDEX "quality_inspections_job_idx" ON "quality_inspections" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "quality_inspections_result_idx" ON "quality_inspections" USING btree ("result");