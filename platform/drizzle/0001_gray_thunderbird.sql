CREATE TYPE "public"."activity_type" AS ENUM('note', 'call', 'email', 'visit', 'other');--> statement-breakpoint
CREATE TYPE "public"."web_store_status" AS ENUM('not_published', 'pending', 'published');--> statement-breakpoint
CREATE TABLE "account_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_groups_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bp_id" uuid NOT NULL,
	"user_id" uuid,
	"type" "activity_type" DEFAULT 'note' NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bp_number" text NOT NULL,
	"company_name" text NOT NULL,
	"account_group_id" uuid,
	"phone" text,
	"email" text,
	"address_street" text,
	"address_city" text,
	"address_state" text,
	"address_zip" text,
	"address_country" text,
	"credit_limit" numeric(14, 2),
	"account_balance" numeric(14, 2),
	"payment_terms" text,
	"internal_notes" text,
	"web_store_status" "web_store_status" DEFAULT 'not_published' NOT NULL,
	"legacy_code" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_partners_bp_number_unique" UNIQUE("bp_number"),
	CONSTRAINT "business_partners_legacy_code_unique" UNIQUE("legacy_code")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bp_id" uuid NOT NULL,
	"first_name" text,
	"last_name" text,
	"title" text,
	"email" text,
	"phone" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_bp_id_business_partners_id_fk" FOREIGN KEY ("bp_id") REFERENCES "public"."business_partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_partners" ADD CONSTRAINT "business_partners_account_group_id_account_groups_id_fk" FOREIGN KEY ("account_group_id") REFERENCES "public"."account_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_partners" ADD CONSTRAINT "business_partners_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_bp_id_business_partners_id_fk" FOREIGN KEY ("bp_id") REFERENCES "public"."business_partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_bp_id_idx" ON "activities" USING btree ("bp_id");--> statement-breakpoint
CREATE INDEX "bp_company_name_idx" ON "business_partners" USING btree ("company_name");--> statement-breakpoint
CREATE INDEX "contacts_bp_id_idx" ON "contacts" USING btree ("bp_id");