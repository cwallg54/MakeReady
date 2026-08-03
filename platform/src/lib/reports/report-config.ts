// Client-safe metadata for the built-in report editor. Declares, per report,
// what an admin/manager can configure: the title, which columns can be hidden,
// which sections can be hidden, the default filters, and the sort options.
// NO database imports here (imported by the editor UI).

export interface ReportColumn { key: string; label: string }
export interface ReportFilterDef {
  key: string;
  label: string;
  type: "text" | "enum";
  options?: { value: string; label: string }[]; // for enum
  placeholder?: string;
}
export interface ReportConfigDef {
  key: string; // matches report_settings.report_key
  name: string; // default title
  href: string;
  columns?: ReportColumn[]; // hideable columns
  sections?: ReportColumn[]; // hideable sections (credit report / dashboard)
  filters?: ReportFilterDef[]; // saved default filters
  sortable?: ReportColumn[]; // sort options (list reports)
}

/** Saved per-report overrides (all optional). */
export interface ReportSettings {
  title?: string;
  hiddenColumns?: string[];
  hiddenSections?: string[];
  filters?: Record<string, string>;
  sortKey?: string;
  sortDir?: "asc" | "desc";
}

const ORDER_TYPE_OPTS = [
  { value: "SS", label: "Screen Print (SS)" },
  { value: "OSH", label: "Off-Shore (OSH)" },
  { value: "ASI", label: "Ad Specialty (ASI)" },
  { value: "VIN", label: "Vinyl (VIN)" },
  { value: "SOUV", label: "Souvenir (SOUV)" },
  { value: "EMBC", label: "Embroidery — Contract (EMBC)" },
  { value: "EMBF", label: "Embroidery — Finished (EMBF)" },
  { value: "IH", label: "In-House (IH)" },
  { value: "BLASG", label: "Blank Goods (BLASG)" },
];

export const REPORT_CONFIGS: ReportConfigDef[] = [
  {
    key: "dashboard",
    name: "Reports",
    href: "/reports",
    sections: [
      { key: "kpis", label: "Headline KPIs" },
      { key: "charts", label: "Charts" },
      { key: "pipeline", label: "Pipeline breakdown" },
      { key: "quotes", label: "Quotes by status" },
      { key: "orders", label: "Orders by stage" },
      { key: "production", label: "Production by status" },
      { key: "inventoryValue", label: "Inventory value by category" },
      { key: "topCustomers", label: "Top customers" },
      { key: "lowStock", label: "Low stock" },
    ],
  },
  {
    key: "sales-analysis",
    name: "Sales Analysis by Salesperson & Customer",
    href: "/reports/standard/sales-analysis",
    columns: [
      { key: "threeMo", label: "3-Month subtotal" },
      { key: "difference", label: "YoY Difference" },
      { key: "twoAgo", label: "2-Years-Ago row" },
    ],
    filters: [
      { key: "salesperson", label: "Only this salesperson (name contains)", type: "text", placeholder: "e.g. Amanda" },
    ],
  },
  {
    key: "open-orders-by-salesperson",
    name: "Open Orders by Salesperson",
    href: "/reports/standard/open-orders-by-salesperson",
    columns: [
      { key: "poNumber", label: "PO #" },
      { key: "entered", label: "Entered date" },
      { key: "dateType", label: "Date type" },
      { key: "shipVia", label: "Ship via" },
    ],
    filters: [
      { key: "salesperson", label: "Only this salesperson (name contains)", type: "text", placeholder: "e.g. Brad" },
      { key: "territory", label: "Only this territory (contains)", type: "text", placeholder: "e.g. Las Vegas" },
    ],
  },
  {
    key: "open-orders-by-type",
    name: "Open Orders by Type",
    href: "/reports/standard/open-orders-by-type",
    columns: [
      { key: "customerCode", label: "Customer code" },
      { key: "salesperson", label: "Salesperson" },
      { key: "dateType", label: "Date type" },
      { key: "entered", label: "Entered date" },
      { key: "daysOpen", label: "Days open" },
    ],
    filters: [
      { key: "type", label: "Default to a single type", type: "enum", options: ORDER_TYPE_OPTS },
    ],
    sortable: [
      { key: "due", label: "Due date" },
      { key: "entered", label: "Entered date" },
      { key: "amount", label: "Amount" },
    ],
  },
  {
    key: "credit",
    name: "Customer Credit Report",
    href: "/reports/standard/credit",
    sections: [
      { key: "trailingSales", label: "Trailing sales" },
      { key: "openOrders", label: "Open orders" },
      { key: "openInvoices", label: "Open invoices + aging" },
      { key: "payments", label: "Recent payments" },
      { key: "activity", label: "Activity log" },
    ],
  },
];

export function reportConfig(key: string): ReportConfigDef | undefined {
  return REPORT_CONFIGS.find((r) => r.key === key);
}

/** Merge helpers used by the report pages. */
export function isHidden(settings: ReportSettings | null | undefined, key: string): boolean {
  return !!settings?.hiddenColumns?.includes(key) || !!settings?.hiddenSections?.includes(key);
}
export function reportTitle(def: ReportConfigDef, settings: ReportSettings | null | undefined): string {
  return settings?.title?.trim() || def.name;
}
