# MakeReady by G54 — Feature Tour & Checklist

A guided list of what's been built and **where to see it**, so you can walk the
live platform and tick each item off.

**How to use this**
- Sign in at **https://makeready.g54.com**.
- "Where to find it" is the sidebar path or page you open.
- Every feature has an in-app help article — click the **?** button in the top
  bar on any page to read the how-to for what you're looking at.
- Some areas are limited by role (noted as *Role:*). As an administrator you can
  see everything.

Last updated: 2026-08-05.

---

## 1. Getting started

- [ ] **Sign in & security** — Where: the login page. Passwords, "remember me", lockout protection, and self-service password reset. *Help: Signing in.*
- [ ] **Two-factor authentication & passkeys** — Where: avatar → *Account security* (`/account/security`). Authenticator app, passkeys/security keys, and recovery codes. *Help: Two-factor authentication & passkeys.*
- [ ] **Your dashboard** — Where: **Dashboard** (home). Role-aware tiles (open quotes/orders, jobs in production, low stock, users) and your open tasks. *Help: Your dashboard.*
- [ ] **Notifications** — Where: the 🔔 in the top bar. Unread count and activity alerts. *Help: Notifications.*
- [ ] **The Help Center** — Where: the **?** button anywhere. 30+ illustrated how-to articles with search; the ? is context-aware and opens the article for the page you're on.
- [ ] **On your phone (field sales + offline)** — Where: open the site on a phone. Bottom navigation, tap-to-call accounts, mobile quote builder, card lists instead of wide tables. Install it to your home screen for a full-screen app, and it shows a friendly offline screen with no signal. *Help: MakeReady on your phone.*

## 2. CRM

- [ ] **Business Partners** — Where: **CRM** (`/crm`). Create/edit accounts, lifecycle stage (Lead → Prospect → Customer), owner, tags, lead source, finance fields (hidden from reps). *Help: Browsing / Creating a Business Partner.*
- [ ] **An account record** — Where: open any account. Contacts, addresses, activity log, tasks, **full order history & lifetime spend**, and finance intake. *Help: Managing an account.*
- [ ] **The pipeline** — Where: **CRM → Pipeline**. Drag accounts across Lead / Prospect / Customer. *Help: Working the pipeline.*
- [ ] **Web lead capture** — Where: public form at `/lead`. New leads land in CRM and notify managers. *Help: Capturing web leads.*
- [ ] **Secure financial intake** — Where: an account → request a Credit / Terms or Credit-Card application; customer completes a secure link. *Help: Secure financial intake documents.*
- [ ] **Finance vault** *(Role: Finance/Admin)* — Where: an account's Finance vault. Private PDF store (Experian, tax-exempt, credit apps). *Help: Finance vault, welcome email & credit-app chase.*

## 3. Sales

- [ ] **Build a quote** — Where: **Sales → Quotes → New**. Templates, catalog items, automatic quantity-band pricing, per-size upcharges, minimums, charges, and discounts. *Help: Building a quote / For reps: the order-form calculators.*
- [ ] **Edit & email a quote** — Where: open a quote. Send it to the customer; status flows Draft → Sent → Accepted → Converted. *Help: Editing & emailing a quote.*
- [ ] **Customer quote approval** — Where: the link the customer receives. They approve/decline online with a signature. *Help: Customer quote approval.*
- [ ] **Orders & production stages** — Where: **Sales → Orders**. Convert a won quote to an order; 6-stage tracker; production spec; PDF. *Help: Orders & production stages.*
- [ ] **Customer order tracker** — Where: the public `/track` link. A Domino's-style live status the customer follows without a login. *Help: The customer order tracker.*
- [ ] **Proof & art approvals** — Where: an order → send a proof; customer approves on their tracker. *Help: Proof & art approvals.*
- [ ] **Sales automations** — Where: **Sales → Automations**. Drip campaigns (tasks/notifications/emails) triggered by new leads. *Help: Sales automations.*

## 4. Art & Production

- [ ] **The art board** — Where: **Art Department** (`/art`). Queue + Kanban of art jobs; assign, rush, statuses. *Help: The art department workflow.*
- [ ] **Punch in the design (art → orderable item)** — Where: open an art request → the **Design & orderable item** panel. Enter the design once and it auto-creates the orderable inventory item with the art attached; the job can't be approved until it's done. *Help: The art department workflow / Creating a design.*
- [ ] **Design Library (the Barcode Book)** — Where: **Design Library** (`/designs`). ~11,800 designs and 53,000+ barcodes, searchable, with catalog and archive filters. *Help: Design Library — overview.*
- [ ] **Design numbering & suffixes** — Where: Design Library → open a design. The full numbering rules and the complete suffix tables. *Help: Design numbers & suffixes.*
- [ ] **Barcodes browser** — Where: **Design Library → Barcodes**. *Help: Design Library — overview.*
- [ ] **Customer reconciliation** — Where: **Design Library → Reconcile**. Link Barcode-Book customer numbers that didn't match an account. *Help: Design customer reconciliation.*
- [ ] **Production workflow** — Where: **Production**. Queue + Kanban for jobs on the floor. *Help: The production workflow.*

## 5. Inventory

- [ ] **Inventory & stock** — Where: **Inventory**. SAP-imported items, on-hand, categories, territories. *Help: Inventory & stock levels.*
- [ ] **Reorder forecast** — Where: **Inventory → Reorder forecast**. Low-stock and reorder suggestions from past sales + lead time. *Help: Reorder forecast, territories & warehouse cleanup.*
- [ ] **Warehouses & bins** — Where: **Inventory → Bins**. *Help: Warehouses & bin management.*

## 6. Accounting *(Role: Finance/Admin)*

- [ ] **AR overview** — Where: **Accounting** (`/accounting`). Outstanding AR, overdue, collected. *Help: Invoicing & payments.*
- [ ] **Invoices & payments** — Where: **Accounting → Invoices / Payments**. Create/issue invoices, record payments, invoice PDF + email. *Help: Invoicing & payments.*
- [ ] **AR aging & statements** — Where: **Accounting → AR aging**; customer statements. *Help: AR aging & statements.*
- [ ] **Credit control** — Where: an account's credit settings / Credit report. Limits, holds, terms; enforcement blocks over-limit orders. *Help: Credit control.*
- [ ] **Credit approvals queue** — Where: **Accounting → Credit requests**. Over-limit orders route here for finance sign-off. *Help: Credit approvals.*

## 7. Reports & Analytics *(Role: Admin, Sales Manager, Finance)*

- [ ] **Executive dashboard** — Where: **Reports** (`/reports`). Headline KPIs, charts, and breakdowns. *Help: Reports & dashboards.*
- [ ] **Standard reports (SAP-parity)** — Where: Reports → Standard reports. Sales Analysis, Open Orders by Salesperson, Open Orders by Type, Customer Credit. *Help: Standard reports.*
- [ ] **Revenue Trend** — Where: `/reports/standard/revenue-trend`. Monthly revenue chart back to **2008** (SAP history + MakeReady), with range toggles and CSV. *Help: Analytics reports.*
- [ ] **Top Products & Designs** — Where: `/reports/standard/top-products`. Best-sellers and sales-by-type, with charts. *Help: Analytics reports.*
- [ ] **Sales-Rep Activity** — Where: `/reports/standard/rep-activity`. Per-rep calls/quotes/orders, with charts. *Help: Analytics reports.*
- [ ] **Lead-Source ROI** — Where: `/reports/standard/lead-source-roi`. Accounts, conversion, and lifetime revenue by source. *Help: Analytics reports.*
- [ ] **Custom report builder** — Where: **Reports → Build a report**. Pick a source, columns, filters; save, export, and schedule by email. *Help: Building & scheduling custom reports.*

## 8. Scheduling

- [ ] **Set your availability** — Where: avatar → *Scheduling* (`/account/scheduling`). *Help: Setting your availability.*
- [ ] **Public booking page** — Where: `/schedule/<your-slug>`. Customers book a time. *Help: The customer booking page.*
- [ ] **Team calendar** — Where: **Calendar**. Month grid (agenda on mobile), reschedule, cancel. *Help: The team calendar / Managing a meeting.*

## 9. Administration *(Role: Admin)*

- [ ] **Users, roles & invites** — Where: **Administration → Users**. Create users (invite link now valid **7 days**), assign roles, activate/deactivate. *Help: Users & roles.*
- [ ] **Account groups** — Where: **Administration → Account groups**. *Help: Account groups.*
- [ ] **Order templates (Template Builder)** — Where: **Administration → Templates**. Charge rules, item catalog, quantity bands, size upcharges. *Help: Order templates.*
- [ ] **Catalog & pricing** — Where: **Administration → Catalog**. Garments, decoration methods, color/size tiers. *Help: Catalog & pricing.*
- [ ] **System configuration** — Where: **Administration → Config**. Company, timezone, fiscal year, number series, MFA policy. *Help: System configuration.*
- [ ] **Audit log** — Where: **Administration → Audit**. Immutable record of every change, with CSV export. *Help: The audit log.*

## 10. Platform & brand

- [ ] **MakeReady by G54 branding** — the logo, lime accent color, and app icon appear across the site (login, sidebar, mobile). Installable as a PWA. *Help: Security & data protection covers how your data is handled.*

---

*Every item above has a matching in-app help article — the fastest way to learn any
feature is to open it and click the **?** in the top bar.*
