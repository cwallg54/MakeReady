ALTER TABLE "quotes" ADD COLUMN "public_token" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "responded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "signed_name" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "response_note" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "response_ip" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_public_token_unique" UNIQUE("public_token");