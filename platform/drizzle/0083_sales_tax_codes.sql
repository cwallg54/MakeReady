CREATE TABLE "tax_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"state" text,
	"rate" numeric(7, 5) DEFAULT '0' NOT NULL,
	"exempt" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"liability_account_id" uuid,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "tax_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "business_partners" ADD COLUMN "tax_code_id" uuid;--> statement-breakpoint
ALTER TABLE "business_partners" ADD COLUMN "tax_exempt" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "business_partners" ADD COLUMN "tax_exempt_certificate" text;--> statement-breakpoint
ALTER TABLE "business_partners" ADD COLUMN "tax_exempt_expires" date;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "tax_code_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "exempt_reason" text;--> statement-breakpoint
CREATE INDEX "tax_codes_state_idx" ON "tax_codes" USING btree ("state");--> statement-breakpoint
CREATE INDEX "tax_codes_active_idx" ON "tax_codes" USING btree ("active");
--> statement-breakpoint
ALTER TABLE "tax_codes" ADD CONSTRAINT "tax_codes_liability_account_fk" FOREIGN KEY ("liability_account_id") REFERENCES "public"."gl_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tax_code_fk" FOREIGN KEY ("tax_code_id") REFERENCES "public"."tax_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_partners" ADD CONSTRAINT "business_partners_tax_code_fk" FOREIGN KEY ("tax_code_id") REFERENCES "public"."tax_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoices_tax_code_idx" ON "invoices" USING btree ("tax_code_id");
