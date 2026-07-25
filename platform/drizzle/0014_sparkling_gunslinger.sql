CREATE TYPE "public"."proof_status" AS ENUM('pending', 'approved', 'changes_requested', 'declined');--> statement-breakpoint
CREATE TABLE "order_proofs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"attachment_id" uuid,
	"token" text NOT NULL,
	"title" text DEFAULT 'Proof' NOT NULL,
	"message" text,
	"status" "proof_status" DEFAULT 'pending' NOT NULL,
	"response_notes" text,
	"signed_name" text,
	"responded_at" timestamp with time zone,
	"ip" text,
	"requested_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_proofs_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "order_proofs" ADD CONSTRAINT "order_proofs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_proofs" ADD CONSTRAINT "order_proofs_attachment_id_order_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."order_attachments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_proofs" ADD CONSTRAINT "order_proofs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_proofs_order_id_idx" ON "order_proofs" USING btree ("order_id");