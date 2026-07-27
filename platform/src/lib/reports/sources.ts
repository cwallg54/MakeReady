// Client-safe report metadata: the data sources, their fields, and the filter
// operators per field type. NO database imports here (imported by the builder UI).

export type FieldType = "text" | "number" | "date" | "enum";
export type FilterOp = "contains" | "eq" | "gt" | "lt" | "after" | "before" | "last_days" | "in";

export interface ReportField {
  key: string;
  label: string;
  type: FieldType;
  filterable?: boolean; // default true
  options?: string[]; // for enum
}
export interface ReportSourceMeta {
  key: string;
  label: string;
  fields: ReportField[];
}
export interface ReportFilter { field: string; op: FilterOp; value: string }
export interface ReportConfig {
  columns: string[];
  filters: ReportFilter[];
  sortField?: string;
  sortDir?: "asc" | "desc";
  rowLimit?: number;
}

export const OPS_BY_TYPE: Record<FieldType, { op: FilterOp; label: string }[]> = {
  text: [{ op: "contains", label: "contains" }, { op: "eq", label: "equals" }],
  number: [{ op: "eq", label: "=" }, { op: "gt", label: ">" }, { op: "lt", label: "<" }],
  date: [{ op: "after", label: "after" }, { op: "before", label: "before" }, { op: "last_days", label: "in last N days" }],
  enum: [{ op: "eq", label: "is" }, { op: "in", label: "is any of (comma-separated)" }],
};

export const SOURCE_META: ReportSourceMeta[] = [
  {
    key: "business_partners",
    label: "Business Partners (CRM)",
    fields: [
      { key: "bpNumber", label: "BP #", type: "text" },
      { key: "companyName", label: "Company", type: "text" },
      { key: "stage", label: "Stage", type: "enum", options: ["lead", "prospect", "customer"] },
      { key: "leadSource", label: "Lead source", type: "text" },
      { key: "city", label: "City", type: "text" },
      { key: "state", label: "State", type: "text" },
      { key: "email", label: "Email", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "owner", label: "Owner", type: "text" },
      { key: "accountGroup", label: "Account group", type: "text" },
      { key: "createdAt", label: "Created", type: "date" },
    ],
  },
  {
    key: "quotes",
    label: "Quotes",
    fields: [
      { key: "quoteNumber", label: "Quote #", type: "text" },
      { key: "customer", label: "Customer", type: "text" },
      { key: "status", label: "Status", type: "enum", options: ["draft", "sent", "accepted", "rejected", "converted"] },
      { key: "subtotal", label: "Subtotal", type: "number" },
      { key: "total", label: "Total", type: "number" },
      { key: "createdAt", label: "Created", type: "date" },
    ],
  },
  {
    key: "orders",
    label: "Orders",
    fields: [
      { key: "orderNumber", label: "Order #", type: "text" },
      { key: "customer", label: "Customer", type: "text" },
      { key: "stage", label: "Stage", type: "enum", options: ["received", "art_proof", "production", "quality", "shipped", "delivered"] },
      { key: "inHandsDate", label: "In-hands date", type: "date" },
      { key: "createdAt", label: "Created", type: "date" },
    ],
  },
  {
    key: "inventory_items",
    label: "Inventory",
    fields: [
      { key: "sku", label: "SKU", type: "text" },
      { key: "name", label: "Item", type: "text" },
      { key: "category", label: "Category", type: "text" },
      { key: "unit", label: "Unit", type: "text" },
      { key: "supplier", label: "Supplier", type: "text" },
      { key: "cost", label: "Cost", type: "number" },
      { key: "onHand", label: "On hand", type: "number" },
      { key: "reorderPoint", label: "Reorder point", type: "number" },
      { key: "value", label: "Stock value", type: "number", filterable: false },
    ],
  },
];

export const sourceMeta = (key: string) => SOURCE_META.find((s) => s.key === key);

// Custom reports are unscoped (rows aren't record-level filtered), so building
// and running them is limited to management roles.
export function canBuildReports(roles: readonly string[]): boolean {
  return roles.some((r) => r === "admin" || r === "sales_manager" || r === "finance");
}
