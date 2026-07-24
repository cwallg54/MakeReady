# Delivery Roadmap

MakeReady is delivered in phases. Each phase produces working, deployable software. Later phases depend on earlier ones but are independently useful.

---

## Phase 1 — Platform Foundation
*The shell. Nothing else works without this.*

**Goal:** Users can log in, see a role-appropriate dashboard, and the system is configured for G54.

| Feature | Epic Ref |
|---|---|
| Authentication (login, logout, password reset) | 1.1 |
| Role-Based Access Control (all 6 roles) | 1.2 |
| User Management (create, edit, deactivate) | 1.3 |
| System Configuration (company, fiscal year, number series) | 1.4 |
| Global Dashboard (role-filtered KPIs) | 1.8 |
| Audit Log | 1.6 |
| In-app Notifications | 1.7 |

**Acceptance:** Each of the 6 roles can log in and sees only the modules and data appropriate to their role. Admins can create users and assign roles.

---

## Phase 2 — Customer & Sales
*Revenue-generating workflows.*

**Goal:** G54 can manage customer accounts, create quotes, generate sales orders, and record payments end-to-end inside MakeReady.

| Feature | Epic Ref |
|---|---|
| Business Partner Master (Customer BPs) | 2.1 |
| Account Groups | 2.2 |
| Contact Management | 2.3 |
| Activity Log | 2.4 |
| Quotes / Estimates | 3.1 |
| Sales Orders (manual creation) | 3.2 |
| Delivery | 3.4 |
| AR Invoice | 3.5 |
| Incoming Payment | 3.6 |

**Acceptance:** Full quote-to-payment cycle completable without leaving MakeReady. All document links (Quote → SO → Delivery → Invoice → Payment) navigate correctly.

---

## Phase 3 — Web Store (Native B2B eCommerce) *(conditional)*
*Requires Phase 2 for BP and Sales Order infrastructure.*

> **Conditional phase.** This phase applies only if G54 builds the native Web Store. If G54 retains its existing eCommerce platform and integrates MakeReady to it instead, this phase is not built — it is replaced by a smaller integration scope (see [Integrations](../technical/integrations.md)) and priced separately. See [SOW](../../SOW.md) Phase 3.

**Goal:** store.g54.com is live and operational. Web Store orders become Sales Orders in MakeReady automatically.

| Feature | Epic Ref |
|---|---|
| Product Catalog (publish inventory items) | 4.1 |
| Account Group Pricing | 4.2 |
| Web Store Order Management | 4.3 |
| Inventory Publish Schedule | 4.4 |
| Web Store Order → Sales Order (automatic) | 3.3 |
| Order Approval Rules (≥ $5k) | 4.5 |
| Web Store Configuration | 4.6 |
| Web Store Status Sync | 3.8 |

**Acceptance:** A customer places an order on store.g54.com. Within 60 seconds, a Sales Order with prefix WEB- appears in MakeReady with all line items, pricing, and customer details. No manual re-entry required.

---

## Phase 4 — Operations (Jobs, Inventory, Quality)
*Production floor visibility.*

**Goal:** Every sales order automatically generates a production job. Art team can attach artwork. Production team can track jobs through to shipping.

| Feature | Epic Ref |
|---|---|
| Job Creation (from SO) | 5.1 |
| Production Queue | 5.2 |
| Job Status Tracking | 5.3 |
| Artwork Attachment | 5.4 |
| Item Master | 6.1 |
| Stock Levels | 6.2 |
| Web Store Publishing (inventory) | 6.3 |
| Quality Management | (from /quality.html) |
| Equipment Maintenance | (from /maintenance.html) |

**Acceptance:** Sales Order created in Phase 2 automatically creates a job in the production queue. Job moves through status stages. Completion triggers delivery creation.

---

## Phase 5 — Finance & Accounting
*Full accounting suite.*

**Goal:** Finance team can operate entirely in MakeReady. SAP B1 is decommissioned.

| Feature | Epic Ref |
|---|---|
| Chart of Accounts | 7.1 |
| Accounts Receivable | 7.2 |
| Accounts Payable | 7.3 |
| Bank Reconciliation | 7.4 |
| Journal Entries | 7.5 |
| Tax Management | 7.6 |
| Cost Centers & Budgets | 7.7, 7.8 |
| P&L by Segment | 7.9 |
| Fixed Asset Register | 7.10 |
| Depreciation Runs | 7.11 |
| SAP B1 Data Migration (complete) | — |

**Acceptance:** Kim Lund (Finance) can close a month entirely in MakeReady. SAP B1 login is no longer required.

---

## Phase 6 — Content Library (Digital Asset Management)
*Findable art. AI-powered.*

**Goal:** Art team can upload and find any graphic asset in seconds using natural language.

| Feature | Epic Ref |
|---|---|
| Asset Upload (all file types, 500 MB max) | 8.1 |
| AI Auto-Tagging on upload | 8.2 |
| AI-Generated Asset Descriptions | 8.3 |
| Natural Language Search | 8.4 |
| Visual Similarity Search | 8.5 |
| Manual Tagging | 8.6 |
| Collections | 8.7 |
| Client Assignment | 8.8 |
| Usage Rights | 8.9 |
| Usage History | 8.10 |
| Job Linking | 8.11 |
| Thumbnail Generation | 8.12 |

**Acceptance:** Tyson Johnson can type "find all graphics with a moose that fit a national parks theme" and receive ranked, relevant results in under 30 seconds. New uploads are tagged automatically within 60 seconds of upload completion.

---

## Phase 7 — Field Sales RBAC & Mobile
*Sales reps in the field.*

**Goal:** Field sales reps (Britney, Leslie, Cody) can log in from any device and submit client orders and upload client artwork without needing office access.

| Feature | Epic Ref |
|---|---|
| Field Sales Role Dashboard | 1.2 |
| Mobile-Responsive Field Sales View | 3.7 |
| Order Upload from Field | 3.7 |
| Client Artwork Upload | 8.1 (role-filtered) |
| Sales Manager Oversight View | 1.2 |

**Acceptance:** A field sales rep on a tablet can log in, find their client's BP, create a sales order with line items, attach artwork, and submit — all within 5 minutes, without asking anyone for help.

---

## Phase 8 — Workflows, Reports & Intelligence
*Automated rules and dashboards.*

| Feature | Epic Ref |
|---|---|
| Approval Rules Engine | 9.1–9.6 |
| Sales, Production, Financial Dashboards | 10.1–10.4 |
| Asset Library Reports | 10.5 |
| CSV / PDF Export | 10.7 |

---

## Future / Phase 9+

- Multi-entity support (11.1–11.3)
- EDI (11.3)
- Customer self-service portal (4.7)
- Native mobile app
- Custom report builder (10.6)
- Drag-and-drop workflow designer (9.7)
- Job costing (5.6)
- Customer proof approval portal (5.7)
- Purchase Orders and Goods Receipts (6.4, 6.6)
