-- Art files (order attachments) can keep their original on Azure Files, with
-- only the path in Neon. Small WebP renditions are stored alongside so pages
-- never load the full-resolution file unless someone asks for it.
ALTER TABLE "order_attachments" ALTER COLUMN "content_base64" DROP NOT NULL;
ALTER TABLE "order_attachments" ADD COLUMN IF NOT EXISTS "storage_provider" text NOT NULL DEFAULT 'db';
ALTER TABLE "order_attachments" ADD COLUMN IF NOT EXISTS "storage_path" text;
ALTER TABLE "order_attachments" ADD COLUMN IF NOT EXISTS "preview_base64" text;
ALTER TABLE "order_attachments" ADD COLUMN IF NOT EXISTS "thumb_base64" text;
