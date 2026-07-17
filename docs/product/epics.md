# Epics & Features

Full feature tree for MakeReady. Each epic maps to one or more wireframe pages. Features marked **[PHASE 2]** are in scope but not MVP.

---

## Epic 1 — Platform Foundation

*Auth, RBAC, admin, and the shell every other module lives inside.*

| Feature | Description | Wireframe |
|---|---|---|
| 1.1 Login & Authentication | Email/password login, session management, password reset | /auth.html |
| 1.2 Role-Based Access Control | 6 roles × 17 modules; field- and action-level permissions | /auth.html + /admin.html |
| 1.3 User Management | Create/edit/deactivate users, assign roles, set default views | /admin.html |
| 1.4 System Configuration | Company settings, branding, fiscal year, number series | /admin.html |
| 1.5 Integration Settings | API keys, Web Store config, SAP B1 migration status | /admin.html |
| 1.6 Audit Log | Immutable log of all data changes: user, timestamp, before/after | /admin.html |
| 1.7 Notifications | In-app notifications for approvals, alerts, job status changes | (global header) |
| 1.8 Global Dashboard | KPI tiles, recent activity, quick-access cards by role | /index.html |

---

## Epic 2 — Customer Management

*Everything to do with knowing and serving customers.*

| Feature | Description | Wireframe |
|---|---|---|
| 2.1 Business Partner Master | Create/edit Customer BPs; sync with SAP B1 entity model | /crm.html |
| 2.2 Account Groups | Pricing tiers and catalog access groups; published to Web Store | /crm.html |
| 2.3 Contact Management | Multiple contacts per BP, role, phone, email, primary flag | /crm.html |
| 2.4 Activity Log | Notes, calls, emails, visits logged per BP with timestamps | /crm.html |
| 2.5 BP — Web Store Link | CRM account group controls which products/prices customer sees in Web Store | /crm.html + /ecommerce.html |
| 2.6 Sales Pipeline View | Opportunity tracking per BP [PHASE 2] | — |

---

## Epic 3 — Sales

*Quote-to-cash: from first quote through collected payment.*

| Feature | Description | Wireframe |
|---|---|---|
| 3.1 Quotes / Estimates | Create quotes linked to BP; line items, pricing, expiry | /sales.html |
| 3.2 Sales Orders | Convert quote to SO; manual SO creation; Web Store SO auto-creation | /sales.html |
| 3.3 Web Store Order Import | Web Store orders become Sales Orders natively (no sync step) | /sales.html + /ecommerce.html |
| 3.4 Delivery | Create delivery from SO; link to production job completion | /sales.html |
| 3.5 AR Invoice | Generate AR Invoice from delivery; apply pricing, tax | /sales.html |
| 3.6 Incoming Payment | Record payment against invoice; mark closed | /sales.html |
| 3.7 Field Sales Upload | Sales reps upload client orders and artwork from field | /auth.html (role view) |
| 3.8 Web Store Status Sync | Order status changes in MakeReady pushed back to Web Store | /sales.html + /ecommerce.html |

---

## Epic 4 — Web Store (Native B2B eCommerce)

*Replaces Zoey B2B. Native module at store.g54.com. No third-party connector.*

| Feature | Description | Wireframe |
|---|---|---|
| 4.1 Product Catalog | Publish inventory items to storefront; control by Account Group | /ecommerce.html |
| 4.2 Account Group Pricing | Different price lists per Account Group; auto-applied at checkout | /ecommerce.html |
| 4.3 Order Management | View and manage incoming Web Store orders | /ecommerce.html |
| 4.4 Inventory Publish Schedule | Control when stock levels sync to storefront | /ecommerce.html |
| 4.5 Order Approval Rules | Orders ≥ $5,000 require manager approval before SO creation | /workflows.html |
| 4.6 Storefront Configuration | Store URL, display name, SAP B1 order prefix (WEB-), branding | /ecommerce.html |
| 4.7 Customer Self-Service Portal | Customers log in to view order history, invoices [PHASE 2] | — |

---

## Epic 5 — Jobs & Production

*From Sales Order to finished product out the door.*

| Feature | Description | Wireframe |
|---|---|---|
| 5.1 Job Creation | Auto-create job from SO; manual job creation | /jobs.html |
| 5.2 Production Queue | Prioritized list of active jobs; drag-to-reorder [PHASE 2] | /jobs.html |
| 5.3 Job Status Tracking | Status flow: New → Prepress → Printing → Finishing → Ready → Shipped | /jobs.html |
| 5.4 Artwork Attachment | Link Content Library assets to jobs; upload artwork per job | /jobs.html |
| 5.5 Press / Equipment Assignment | Assign job to specific press or finishing equipment [PHASE 2] | — |
| 5.6 Job Costing | Track materials and time against job budget [PHASE 2] | — |
| 5.7 Customer Proof Approval | Send proof link to customer; capture approval [PHASE 2] | — |

---

## Epic 6 — Inventory & MRP

*What G54 has on hand and what they need to order.*

| Feature | Description | Wireframe |
|---|---|---|
| 6.1 Item Master | Create/manage items; sync from SAP B1 migration | /inventory.html |
| 6.2 Stock Levels | On-hand, committed, available quantities by warehouse | /inventory.html |
| 6.3 Web Store Publishing | Mark items as published/unpublished to storefront | /inventory.html |
| 6.4 Purchase Orders | Create POs to vendors [PHASE 2] | — |
| 6.5 MRP | Material requirements planning — suggest reorder quantities [PHASE 2] | /inventory.html |
| 6.6 Goods Receipt | Receive PO against inventory [PHASE 2] | — |

---

## Epic 7 — Finance & Accounting

*The money side.*

| Feature | Description | Wireframe |
|---|---|---|
| 7.1 Chart of Accounts | Account structure imported from SAP B1 | /accounting.html |
| 7.2 Accounts Receivable | AR aging, invoice status, payment tracking | /accounting.html |
| 7.3 Accounts Payable | AP aging, vendor invoices, payment runs | /accounting.html |
| 7.4 Bank Reconciliation | Match bank transactions to payments | /accounting.html |
| 7.5 Journal Entries | Manual GL postings | /accounting.html |
| 7.6 Tax Management | Sales tax rates, codes, reporting | /accounting.html |
| 7.7 Cost Centers | Department-level budget tracking | /controlling.html |
| 7.8 Budgets | Annual budget vs actual reporting | /controlling.html |
| 7.9 P&L by Segment | Profit & loss by cost center or project | /controlling.html |
| 7.10 Fixed Asset Register | Asset list, purchase value, depreciation method | /assets.html |
| 7.11 Depreciation Runs | Automated monthly depreciation posting | /assets.html |

---

## Epic 8 — Content Library (Digital Asset Management)

*Find any piece of artwork in seconds. Powered by AI.*

| Feature | Description | Wireframe |
|---|---|---|
| 8.1 Asset Upload | Drag-and-drop upload; PNG, JPG, SVG, PDF, AI, EPS, PSD; up to 500 MB | /library.html |
| 8.2 AI Auto-Tagging | On upload, AI analyzes image content and generates descriptive tags | /library.html |
| 8.3 AI-Generated Descriptions | One-sentence natural language description of each asset | /library.html |
| 8.4 Natural Language Search | Query assets in plain English: "moose in national parks theme" | /library.html |
| 8.5 Visual Similarity Search | Find assets that look visually similar to a selected image | /library.html |
| 8.6 Manual Tagging | Art team adds and edits tags manually | /library.html |
| 8.7 Collections | Organize assets into client, theme, or campaign folders | /library.html |
| 8.8 Client Assignment | Assign assets to a client BP; respects access control | /library.html |
| 8.9 Usage Rights | Tag assets: client-owned, licensed stock, G54-owned, royalty-free | /library.html |
| 8.10 Usage History | Track which jobs an asset has been used in | /library.html |
| 8.11 Job Linking | Use asset in job directly from library | /library.html + /jobs.html |
| 8.12 Thumbnail Generation | Auto-generate web preview thumbnail on upload | /library.html |
| 8.13 Version History | Track versions of the same asset over time [PHASE 2] | — |

---

## Epic 9 — Workflows & Approvals

*Automated business rules and multi-step approvals.*

| Feature | Description | Wireframe |
|---|---|---|
| 9.1 Approval Rules Engine | Configurable rules: trigger, condition, approver chain | /workflows.html |
| 9.2 Web Store Order Approval | Orders ≥ $5,000 auto-routed to Sales Manager | /workflows.html |
| 9.3 Credit Limit Override | SO that exceeds customer credit limit routes to Finance | /workflows.html |
| 9.4 Artwork Approval | Job artwork routed to Art Department lead before printing | /workflows.html |
| 9.5 Approval Notifications | Email + in-app notification to approvers | /workflows.html |
| 9.6 Approval Audit Trail | Full history of who approved/rejected and when | /workflows.html |
| 9.7 Custom Workflow Builder | Drag-and-drop workflow designer [PHASE 2] | — |

---

## Epic 10 — Reports & Intelligence

*Data that helps G54 make decisions.*

| Feature | Description | Wireframe |
|---|---|---|
| 10.1 Sales Dashboard | Revenue MTD/YTD, top customers, open orders | /reports.html |
| 10.2 Production Dashboard | Jobs in progress, late jobs, throughput | /reports.html |
| 10.3 Financial Dashboard | AR aging, AP aging, cash position | /reports.html |
| 10.4 Web Store Analytics | Orders, GMV, conversion from catalog to order | /reports.html |
| 10.5 Asset Library Report | Most-used assets, unused assets, storage utilization | /reports.html |
| 10.6 Custom Report Builder | Build and save custom tabular reports [PHASE 2] | — |
| 10.7 Data Export | Export any report to CSV or PDF | /reports.html |

---

## Epic 11 — Enterprise

*Multi-entity and EDI for future G54 growth.*

| Feature | Description | Wireframe |
|---|---|---|
| 11.1 Multi-Entity Support | Operate multiple legal entities under one platform [PHASE 2] | /enterprise.html |
| 11.2 Intercompany Transactions | Journal entries between entities [PHASE 2] | /enterprise.html |
| 11.3 EDI | Electronic data interchange with trading partners [PHASE 2] | /enterprise.html |
