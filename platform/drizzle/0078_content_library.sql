CREATE TABLE "content_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_number" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"file_name" text NOT NULL,
	"mime_type" text DEFAULT 'application/octet-stream' NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"kind" text DEFAULT 'image' NOT NULL,
	"content_base64" text NOT NULL,
	"thumbnail_base64" text,
	"tags" text[],
	"collection_id" uuid,
	"client_bp_id" uuid,
	"usage_rights" text DEFAULT 'internal' NOT NULL,
	"rights_note" text,
	"ai_tagged" boolean DEFAULT false NOT NULL,
	"embedded" boolean DEFAULT false NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_assets_asset_number_unique" UNIQUE("asset_number")
);
--> statement-breakpoint
CREATE TABLE "content_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"order_id" uuid,
	"context" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_collection_id_content_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."content_collections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_client_bp_id_business_partners_id_fk" FOREIGN KEY ("client_bp_id") REFERENCES "public"."business_partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_collections" ADD CONSTRAINT "content_collections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_usage" ADD CONSTRAINT "content_usage_asset_id_content_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."content_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_usage" ADD CONSTRAINT "content_usage_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_usage" ADD CONSTRAINT "content_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_assets_collection_idx" ON "content_assets" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "content_assets_client_idx" ON "content_assets" USING btree ("client_bp_id");--> statement-breakpoint
CREATE INDEX "content_assets_kind_idx" ON "content_assets" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "content_collections_name_idx" ON "content_collections" USING btree ("name");--> statement-breakpoint
CREATE INDEX "content_usage_asset_idx" ON "content_usage" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "content_usage_order_idx" ON "content_usage" USING btree ("order_id");