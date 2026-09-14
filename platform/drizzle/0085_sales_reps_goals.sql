CREATE TABLE "sales_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rep_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"note" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_reps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"user_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sales_reps_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "historical_orders" ADD COLUMN "rep_id" uuid;--> statement-breakpoint
ALTER TABLE "sales_goals" ADD CONSTRAINT "sales_goals_rep_id_sales_reps_id_fk" FOREIGN KEY ("rep_id") REFERENCES "public"."sales_reps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_goals" ADD CONSTRAINT "sales_goals_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_reps" ADD CONSTRAINT "sales_reps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_goals_rep_month_uk" ON "sales_goals" USING btree ("rep_id","year","month");--> statement-breakpoint
CREATE INDEX "sales_goals_period_idx" ON "sales_goals" USING btree ("year","month");--> statement-breakpoint
CREATE INDEX "sales_reps_user_idx" ON "sales_reps" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sales_reps_active_idx" ON "sales_reps" USING btree ("active");
--> statement-breakpoint
ALTER TABLE "historical_orders" ADD CONSTRAINT "historical_orders_rep_id_fk" FOREIGN KEY ("rep_id") REFERENCES "public"."sales_reps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "historical_orders_rep_idx" ON "historical_orders" USING btree ("rep_id","doc_date");
