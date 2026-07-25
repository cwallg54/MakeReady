ALTER TABLE "orders" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "voided_by" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;