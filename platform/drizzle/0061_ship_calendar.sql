CREATE TABLE "ship_calendar" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day" text NOT NULL,
	"capacity" integer,
	"note" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ship_calendar_day_unique" UNIQUE("day")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "ship_date" text;--> statement-breakpoint
ALTER TABLE "ship_calendar" ADD CONSTRAINT "ship_calendar_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ship_calendar_day_idx" ON "ship_calendar" USING btree ("day");