CREATE TYPE "public"."report_visibility" AS ENUM('private', 'shared', 'everyone');--> statement-breakpoint
CREATE TABLE "report_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid,
	"report_key" text,
	"role" text,
	"user_id" uuid,
	"can_view" boolean DEFAULT true NOT NULL,
	"can_edit" boolean DEFAULT false NOT NULL,
	"can_delete" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_definitions" ADD COLUMN "visibility" "report_visibility" DEFAULT 'everyone' NOT NULL;--> statement-breakpoint
ALTER TABLE "report_definitions" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "report_settings" ADD COLUMN "restricted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "report_grants" ADD CONSTRAINT "report_grants_report_id_report_definitions_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_grants" ADD CONSTRAINT "report_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_grants" ADD CONSTRAINT "report_grants_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_grants_report_idx" ON "report_grants" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "report_grants_key_idx" ON "report_grants" USING btree ("report_key");--> statement-breakpoint
CREATE INDEX "report_grants_user_idx" ON "report_grants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "report_grants_role_idx" ON "report_grants" USING btree ("role");--> statement-breakpoint
ALTER TABLE "report_definitions" ADD CONSTRAINT "report_definitions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;