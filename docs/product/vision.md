# Product Vision & Scope

## What Is MakeReady?

MakeReady is a Print Management Information System (Print MIS) and ERP built specifically for Great Mountain West (G54.com), a commercial print and graphics production company. The platform manages the full business lifecycle: customer relationships, quoting and sales orders, production job management, art and digital asset management, inventory, accounting, and B2B eCommerce — in a single integrated system.

The industry category is **Print MIS / ERP**, comparable to EFI Pace, Tharstern, and Clarity — but purpose-built for G54's workflows rather than adapted from a generic ERP.

---

## The Problem Being Solved

G54 currently operates on a patchwork of disconnected systems:

| Current System | Function | Problem |
|---|---|---|
| SAP Business One | ERP core (accounting, inventory, sales) | Expensive, over-engineered for print, requires middleware for everything |
| Zoey B2B (greatmountainwest.zoey.com) | B2B eCommerce storefront | External SaaS dependency; sync requires Vision33 middleware |
| Vision33 Saltbox | iPaaS connector between SAP B1 and Zoey | Additional cost, additional failure point, limited control |

**The goal:** Replace all three with a single platform where eCommerce, ERP, and production management are native — no middleware, no external storefronts, no sync lag.

---

## Product Goals

1. **Unify operations** — one system for sales, production, finance, and art management
2. **Eliminate middleware** — direct integrations only; no iPaaS connectors
3. **Accelerate order-to-cash** — Web Store orders become Sales Orders automatically, flow to AR Invoice and payment without manual re-entry
4. **Enable field sales** — mobile-accessible sales rep portal for order and artwork upload from client sites
5. **Surface tribal knowledge** — AI-powered Content Library makes art assets findable across projects and clients without manual cataloging effort

---

## Success Metrics

| Metric | Target |
|---|---|
| Order-to-production time | Reduced from [TBD current baseline] to same-day |
| Web Store order sync lag | 0 minutes (was up to 2-hour Saltbox sync delay) |
| Asset search time | < 30 seconds for any query (was manual folder browsing) |
| Duplicate data entry incidents | 0 (was every Web Store order required manual SO creation) |
| System count for core operations | 1 (down from 3) |

---

## Users & Roles

| Role | Description | Primary Modules |
|---|---|---|
| Admin | Full system access, configuration | All modules + Administration |
| Sales Manager | Manages sales team and pipeline | CRM, Sales, Web Store, Reports |
| Sales Rep | Field and office sales, client-facing | CRM, Sales, Web Store (view), Content Library (client assets) |
| Finance/Accounting | Invoicing, payments, reporting | Accounting, Controlling, Asset Accounting, Reports |
| Production | Job management and scheduling | Jobs & Production, Inventory, Quality, Equipment Maintenance |
| Art Department | Artwork management and production support | Content Library (full), Jobs & Production (artwork tasks) |

Full permission matrix: see [requirements/rbac.md](../requirements/rbac.md)

---

## Scope — In

- Customer (BP) management and contact database
- Quote, Sales Order, Delivery, AR Invoice, Incoming Payment document flow
- Native B2B Web Store (store.g54.com) with Account Group pricing and catalog control
- Job/work order creation, production queue, status tracking
- Inventory item master, stock levels, MRP
- Accounts payable, accounts receivable, bank reconciliation
- Cost center accounting and P&L (Controlling)
- Fixed asset register and depreciation (Asset Accounting)
- Digital Asset Management with AI auto-tagging and NLP natural language search
- Role-based access control with field sales mobile login
- Approval workflows (configurable rules, multi-step chains)
- Reporting and business intelligence dashboards
- Multi-user administration, audit logs
- SAP Business One data migration (master data + open transactions)

## Scope — Out (explicitly excluded)

- Payroll processing (out of scope; handled externally)
- HR / people management
- Multi-currency (single currency: USD, unless added in Phase 2)
- Multi-language / localization
- Customer-facing self-service portal (Web Store is staff-managed B2B, not self-service checkout) **[TBD — may become Phase 2]**
- Native mobile app (responsive web only for MVP; app is Phase 2)
- Third-party marketplace integrations (Amazon, etc.)

---

## Constraints & Non-Functional Requirements

| Requirement | Detail |
|---|---|
| Browser support | Latest Chrome, Firefox, Safari, Edge |
| Responsive design | Must work on tablet for field sales use |
| Authentication | Secure login; session timeout after [TBD] minutes of inactivity |
| Data residency | US-based hosting only |
| Uptime SLA | 99.5% minimum |
| Audit logging | Every data mutation logged with user, timestamp, before/after values |
| File storage (DAM) | Support files up to 500 MB; total storage [TBD] TB |
| AI API dependency | Content Library NLP search requires Anthropic Claude API or equivalent |
| SAP B1 migration | All historical data migrated; no data loss acceptable |
