import type { Role } from "@/db/schema";
import type { NavItem } from "@/components/app-nav";
import { canView } from "@/lib/rbac";
import { canDoArt } from "@/lib/art/access";

export function buildSidebar(roles: Role[]): NavItem[] {
  // The sidebar is eight department sections, each owned by one stakeholder
  // group: Home, Sales, Web Store, Art, Operations, Finance, Reports, Admin.
  // Every link carries the module gate its page enforces, so a section shows
  // only what the user can open. Sub-section headers are dropped when nothing
  // under them survives, and a section left with one link renders as that link.
  type Entry = NavItem & { allowed?: boolean };
  const link = (key: string, label: string, href: string, allowed = true): Entry => ({ key, label, href, phase1: true, allowed });
  const header = (key: string, label: string): Entry => ({ key, label, phase1: true, header: true });
  const crm = canView(roles, "crm");
  const sales = canView(roles, "sales");
  const art = canDoArt(roles);
  const acct = canView(roles, "accounting");
  const ctrl = canView(roles, "controlling");
  const assets = canView(roles, "asset_accounting");

  const SECTIONS: { key: string; label: string; children: Entry[] }[] = [
    {
      key: "home",
      label: "Home",
      children: [
        link("home-dashboard", "Dashboard", "/dashboard", canView(roles, "dashboard")),
        link("home-approvals", "Approvals Inbox", "/workflows/approvals", canView(roles, "workflows")),
      ],
    },
    {
      key: "sales",
      label: "Sales",
      children: [
        header("sales-h-crm", "Customers"),
        link("crm-bp", "Business Partners", "/crm", crm),
        link("crm-pipeline", "Pipeline", "/crm/pipeline", crm),
        link("crm-reorders", "Reorder radar", "/crm/reorders", crm),
        header("sales-h-sales", "Selling"),
        link("sales-quotes", "Quotes", "/sales", sales),
        link("sales-orders", "Orders", "/sales/orders", sales),
        link("sales-calendar", "Calendar", "/calendar", sales),
        link("sales-automations", "Automations", "/sales/automations", sales),
      ],
    },
    {
      key: "web_store",
      label: "Web Store",
      children: [link("web-store", "Web Store", "/web-store", canView(roles, "web_store"))],
    },
    {
      key: "art",
      label: "Art",
      children: [
        link("art", "Art Department", "/art", art),
        link("designs", "Design Library", "/designs", art),
        link("content", "Content Library", "/content-library", canView(roles, "content_library")),
      ],
    },
    {
      key: "operations",
      label: "Operations",
      children: [
        link("production", "Production", "/production", canView(roles, "jobs")),
        link("inventory", "Inventory", "/inventory", canView(roles, "inventory")),
        link("quality", "Quality", "/quality", canView(roles, "quality")),
        link("maintenance", "Maintenance", "/maintenance", canView(roles, "maintenance")),
      ],
    },
    {
      key: "finance",
      label: "Finance",
      children: [
        link("acct-overview", "Overview", "/accounting", acct),
        header("acct-h-ar", "Receivables"),
        link("acct-invoices", "Invoices", "/accounting/invoices", acct),
        link("acct-payments", "Payments", "/accounting/payments", acct),
        link("acct-collections", "Collections", "/accounting/collections", acct),
        link("acct-aging", "AR Aging", "/accounting/aging", acct),
        link("acct-credit-memos", "Credit Memos", "/accounting/credit-memos", acct),
        link("acct-deposits", "Deposits", "/accounting/deposits", acct),
        link("acct-statements", "Customer Statements", "/accounting/statements", acct),
        link("acct-credit", "Credit Requests", "/accounting/credit-requests", acct),
        header("acct-h-ap", "Payables"),
        link("acct-bills", "Bills", "/accounting/bills", acct),
        link("acct-vendors", "Vendors", "/accounting/vendors", acct),
        link("acct-runs", "Payment Runs", "/accounting/payment-runs", acct),
        link("acct-vcredits", "Vendor Credits", "/accounting/vendor-credits", acct),
        link("acct-grni", "GRNI", "/accounting/grni", acct),
        link("acct-expenses", "Expenses", "/accounting/expenses", acct),
        header("acct-h-gl", "General Ledger"),
        link("acct-chart", "Chart of Accounts", "/accounting/chart", acct),
        link("acct-journal", "Journal Entries", "/accounting/journal", acct),
        link("acct-ledger", "Account Ledger", "/accounting/ledger", acct),
        link("acct-trial", "Trial Balance", "/accounting/trial-balance", acct),
        link("acct-payroll", "Payroll Journals", "/accounting/payroll", acct),
        header("acct-h-stmt", "Financial Statements"),
        link("acct-pl", "Income Statement", "/accounting/income-statement", acct),
        link("acct-bs", "Balance Sheet", "/accounting/balance-sheet", acct),
        link("acct-cf", "Cash Flow", "/accounting/cash-flow", acct),
        link("acct-segpnl", "P&L by Segment", "/accounting/segment-pnl", acct),
        header("acct-h-assets", "Fixed Assets"),
        link("acct-assets", "Asset Register", "/accounting/assets", assets),
        link("acct-depr", "Depreciation", "/accounting/assets/depreciation", assets),
        header("acct-h-ctrl", "Controlling"),
        link("ctrl-overview", "Overview", "/controlling", ctrl),
        link("ctrl-profit", "Profitability", "/controlling/profitability", ctrl),
        link("ctrl-jobcost", "Job Costing", "/controlling/job-costing", ctrl),
        link("ctrl-cc", "Cost Centers", "/controlling/cost-centers", ctrl),
        link("ctrl-budget", "Budget vs Actual", "/controlling/budget", ctrl),
        header("acct-h-close", "Tax, Close & Setup"),
        link("acct-taxfiling", "Sales Tax Filing", "/accounting/tax-filing", acct),
        link("acct-reconcile", "Bank Reconciliation", "/accounting/reconcile", acct),
        link("acct-periods", "Fiscal Periods", "/accounting/periods", acct),
        link("acct-close", "Period Close", "/accounting/close", acct),
        link("acct-import", "Import / Migrate", "/accounting/import", acct),
      ],
    },
    {
      key: "reports",
      label: "Reports",
      children: [
        link("reports", "Reports", "/reports", canView(roles, "reports")),
        link("acct-flash", "Weekly Flash", "/accounting/flash", acct),
        link("acct-quarterly", "Quarterly Pack", "/accounting/quarterly", acct),
        link("acct-goals", "Sales Goals", "/accounting/goals", acct),
      ],
    },
    {
      key: "admin",
      label: "Admin",
      children: [
        link("admin", "Administration", "/admin", canView(roles, "administration")),
        link("wf-home", "Workflows", "/workflows", canView(roles, "workflows")),
      ],
    },
  ];

  const items: NavItem[] = [];
  for (const s of SECTIONS) {
    // Keep permitted links, and keep a header only when a permitted link follows it before the next header.
    const kept = s.children.filter((c, i) =>
      c.header ? s.children.slice(i + 1).find((n) => n.header || n.allowed)?.allowed === true : c.allowed,
    );
    const strip = (c: Entry): NavItem => ({ key: c.key, label: c.label, href: c.href, phase1: c.phase1, header: c.header });
    const links = kept.filter((c) => !c.header).map(strip);
    if (links.length === 0) continue;
    if (links.length === 1) items.push(links[0]);
    else items.push({ key: s.key, label: s.label, phase1: true, children: kept.map(strip) });
  }
  return items;
}
