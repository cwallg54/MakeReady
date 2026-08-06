CREATE TYPE "public"."gl_account_type" AS ENUM('asset', 'liability', 'equity', 'revenue', 'expense');--> statement-breakpoint
CREATE TYPE "public"."journal_status" AS ENUM('draft', 'posted', 'void');--> statement-breakpoint
CREATE TABLE "gl_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" "gl_account_type" NOT NULL,
	"subtype" text,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"system_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gl_accounts_code_unique" UNIQUE("code"),
	CONSTRAINT "gl_accounts_system_key_unique" UNIQUE("system_key")
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_number" text NOT NULL,
	"date" timestamp with time zone DEFAULT now() NOT NULL,
	"memo" text,
	"status" "journal_status" DEFAULT 'draft' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"source_id" uuid,
	"posted_at" timestamp with time zone,
	"posted_by" uuid,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_entries_entry_number_unique" UNIQUE("entry_number")
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"debit" numeric(14, 2) DEFAULT '0' NOT NULL,
	"credit" numeric(14, 2) DEFAULT '0' NOT NULL,
	"memo" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_gl_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."gl_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gl_accounts_type_idx" ON "gl_accounts" USING btree ("type");--> statement-breakpoint
CREATE INDEX "journal_entries_status_idx" ON "journal_entries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "journal_entries_date_idx" ON "journal_entries" USING btree ("date");--> statement-breakpoint
CREATE INDEX "journal_entries_source_idx" ON "journal_entries" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "journal_lines_entry_idx" ON "journal_lines" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "journal_lines_account_idx" ON "journal_lines" USING btree ("account_id");--> statement-breakpoint
INSERT INTO "gl_accounts" ("code","name","type","subtype","system_key") VALUES
	('1000','Cash — Operating','asset','Current Asset','cash'),
	('1010','Cash — Payroll','asset','Current Asset',NULL),
	('1100','Accounts Receivable','asset','Current Asset','ar'),
	('1200','Inventory','asset','Current Asset','inventory'),
	('1500','Equipment','asset','Fixed Asset',NULL),
	('1510','Accumulated Depreciation','asset','Fixed Asset',NULL),
	('2000','Accounts Payable','liability','Current Liability','ap'),
	('2100','Sales Tax Payable','liability','Current Liability','sales_tax'),
	('2200','Accrued Payroll','liability','Current Liability',NULL),
	('2300','Line of Credit','liability','Current Liability',NULL),
	('3000','Owner''s Equity','equity','Equity',NULL),
	('3900','Retained Earnings','equity','Equity','retained_earnings'),
	('4000','Sales Revenue','revenue','Operating Revenue','sales'),
	('4100','Shipping Income','revenue','Operating Revenue',NULL),
	('4900','Sales Discounts','revenue','Contra Revenue','sales_discounts'),
	('5000','Cost of Goods Sold','expense','COGS','cogs'),
	('6000','Payroll Expense','expense','Operating Expense',NULL),
	('6100','Rent','expense','Operating Expense',NULL),
	('6200','Utilities','expense','Operating Expense',NULL),
	('6300','Shop Supplies','expense','Operating Expense',NULL),
	('6400','Advertising & Marketing','expense','Operating Expense',NULL),
	('6500','Depreciation Expense','expense','Operating Expense',NULL),
	('6900','Bank & Merchant Fees','expense','Operating Expense',NULL)
ON CONFLICT ("code") DO NOTHING;