ALTER TABLE "customer_documents" ADD COLUMN "order_id" uuid;--> statement-breakpoint
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_documents_order_id_idx" ON "customer_documents" USING btree ("order_id");