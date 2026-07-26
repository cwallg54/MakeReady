"use client";

import { useActionState } from "react";
import { createItemAction, type InventoryState } from "@/lib/inventory/actions";
import { AdminField, AdminSubmit } from "@/components/admin-form";
import { FormError } from "@/components/form";

export function ItemCreateForm() {
  const [state, action] = useActionState<InventoryState, FormData>(createItemAction, {});
  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField label="Item name" name="name" required />
        <AdminField label="SKU" name="sku" hint="Leave blank to auto-generate from the name" />
        <AdminField label="Category" name="category" hint="e.g. Blanks, Ink, Thread" />
        <AdminField label="Unit" name="unit" hint="each, box, roll…" />
        <AdminField label="Supplier" name="supplier" />
        <AdminField label="Cost" name="cost" type="number" />
        <AdminField label="On hand" name="onHand" type="number" />
        <AdminField label="Reorder point" name="reorderPoint" type="number" />
      </div>
      <AdminField label="Notes" name="notes" />
      <AdminSubmit>Add item</AdminSubmit>
    </form>
  );
}
