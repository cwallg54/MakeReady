ALTER TABLE "content_assets" ALTER COLUMN "content_base64" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "content_assets" ADD COLUMN "storage_provider" text DEFAULT 'db' NOT NULL;--> statement-breakpoint
ALTER TABLE "content_assets" ADD COLUMN "storage_share" text;--> statement-breakpoint
ALTER TABLE "content_assets" ADD COLUMN "storage_path" text;--> statement-breakpoint
ALTER TABLE "content_assets" ADD COLUMN "last_synced_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "content_assets_storage_path_uk" ON "content_assets" USING btree ("storage_share","storage_path");