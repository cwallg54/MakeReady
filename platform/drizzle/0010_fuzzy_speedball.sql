CREATE TABLE "order_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text DEFAULT 'application/pdf' NOT NULL,
	"content_base64" text NOT NULL,
	"sent_to" text,
	"sent_at" timestamp with time zone,
	"send_status" text DEFAULT 'saved' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_artifacts" ADD CONSTRAINT "order_artifacts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_artifacts" ADD CONSTRAINT "order_artifacts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_artifacts_order_id_idx" ON "order_artifacts" USING btree ("order_id");