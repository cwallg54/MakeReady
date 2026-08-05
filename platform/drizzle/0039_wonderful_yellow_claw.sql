CREATE TABLE "store_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_name" text DEFAULT 'The G54 Store' NOT NULL,
	"tagline" text,
	"hero_headline" text,
	"hero_subtext" text,
	"contact_email" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"public_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
