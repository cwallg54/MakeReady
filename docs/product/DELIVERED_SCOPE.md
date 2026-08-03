# MakeReady by G54 — Delivered Scope Checklist

Project management scope document of features **built and deployed** to production
(makeready.g54.com). Status legend:

- [x] Delivered & live
- [~] Delivered, dependent on an external step (noted)
- [ ] Not yet built (backlog)

Last updated: 2026-08-03.

---

## Phase 0 — Platform Foundation

### 0.1 Authentication
- [x] Email + password sign-in (bcrypt hashing)
- [x] JWT session in HTTP-only cookie (server-side session table)
- [x] Single active session per user (new login ends other sessions)
- [x] "Remember me" (30-day session; ~1-hour idle otherwise, configurable)
- [x] Account lockout after 5 failed attempts (15-minute auto-clear)
- [x] Admin notification on account lockout
- [x] Self-service "Forgot password" (1-hour token link)
- [x] Forced password reset (first login / admin-required)
- [x] Password policy (min 10 chars, upper + lower + number)
- [x] Edge proxy auth gate + Node-layer deep guards (session/active/RBAC)

### 0.2 Multi-Factor Authentication
- [x] TOTP authenticator app enrollment (QR + manual key)
- [x] WebAuthn / FIDO2 passkeys & security keys (add/remove, per device)
- [x] Recovery codes (generate/regenerate, single-use, downloadable)
- [x] MFA challenge step at login (passkey / code / recovery code)
- [x] Org-wide "Require MFA" policy with enforced enrollment redirect

### 0.3 Role-Based Access Control
- [x] 6 roles: Admin, Sales Manager, Sales Rep, Finance/Accounting, Production, Art
- [x] Module × access-level permission matrix (none / view / edit / full)
- [x] Additive roles (highest access wins)
- [x] Record-level scoping (Sales Rep limited to own accounts)
- [x] Finance-sensitive field visibility control

### 0.4 User Management
- [x] Create user + welcome/invite email (set-password link)
- [x] Edit user details and roles
- [x] Activate / Deactivate (deactivate ends sessions immediately)
- [x] Delete user (inactive accounts only; hard delete)
- [x] Force password reset
- [x] Self-lockout guards (can't self-deactivate, remove last admin, or delete self)

### 0.5 System Configuration
- [x] Company & legal name
- [x] Timezone (America/Denver) applied app-wide
- [x] Fiscal year start month
- [x] Session timeout (minutes)
- [x] Require-MFA toggle
- [x] Document number series (BP-, QUO-, SO-, DEL-, INV-, PAY-)

### 0.6 Audit & Notifications
- [x] Immutable, append-only audit log (every mutation)
- [x] Audit filters (date range, actor) + CSV export (13-month retention)
- [x] In-app notifications + unread-count bell

### 0.7 Platform, Navigation & Enablement
- [x] Next.js 16 (App Router) + TypeScript + Tailwind v4
- [x] Neon Postgres + Drizzle ORM + versioned migrations
- [x] Vercel production deployment at makeready.g54.com (GitHub auto-deploy)
- [x] Role-aware global dashboard
- [x] Branding / logo; Mountain-time display everywhere
- [x] Collapsible sidebar submenus (CRM, Sales)
- [x] Help Center: 25 how-to articles with screenshots + search
- [x] Contextual "?" button (deep-links to the article for the current page)
- [~] Transactional email (Resend provisioned; **awaiting g54.com DNS verification** to deliver)

---

## Phase 2 — CRM

### 2.1 Business Partners
- [x] Create / edit / view Business Partner records
- [x] Auto BP number; duplicate-name soft warning ("Create anyway")
- [x] Lifecycle stage (Lead / Prospect / Customer) with quick-change
- [x] Owner assignment
- [x] Tags, lead source (fixed pick-list), account group
- [x] Finance fields (credit limit, terms, notes) hidden from Sales Reps

### 2.2 Contacts & Addresses
- [x] Multiple contacts per account, one primary (add/edit/remove)
- [x] Multiple addresses (billing / shipping / other)

### 2.3 Activity & Tasks
- [x] Immutable activity log (Note / Call / Email / Visit / Other)
- [x] Automatic system entries for every account change
- [x] Tasks & follow-ups (assignee, due date, complete/reopen, overdue flag)
- [x] Open tasks surfaced on the dashboard

### 2.4 Pipeline & List
- [x] Pipeline Kanban (Lead → Prospect → Customer, drag via buttons)
- [x] List with stage filters, "My accounts", company search
- [x] Sortable columns (BP #, Company, Stage, Owner, Group, Location)
- [x] Filter bar (owner, account group, city/state) — all URL-shareable

### 2.5 Lead Capture & Account Groups
- [x] Public "Request a quote" lead form (/lead) → creates Lead + notifies managers
- [x] Spam honeypot on the public form
- [x] Account Groups admin (seeded Standard / Wholesale / Government)
- [x] Book-a-meeting link on the account (when owner has a booking profile)

### 2.6 Data Migration
- [x] Legacy ERP import: 7,109 business partners, 9,909 contacts, 14,146 addresses, 16 account groups

---

## Phase 2 — Sales

### 3.1 Quote Templates (Template Builder)
- [x] Configurable order-form templates (admin)
- [x] Item catalog with supplier cost + markup % → computed sell price
- [x] Default template markup
- [x] Charge rules: flat / per-unit / per-color / per-hour / percent
- [x] Charge conditions: always / new-only / reorder-only
- [x] **Quantity price-break bands** per item (e.g. caps 72/144/288/432/576) — replicates the Excel "CAP PRICING" tab
- [x] **Per-size upcharges** per item (e.g. 2XL +$2, 3XL +$3) — replicates the Baja/apparel size pricing
- [x] **Minimum order quantity** per item (e.g. Animal caps min 144)
- [x] Per-item "Quantity bands & sizes" editor in the Template Builder
- [x] Seeded real pricing: Caps (OSH) bands (RC/REN/VEL/Animal) + Baja size upcharges

### 3.2 Quote Builder
- [x] Create quote from a product template
- [x] Line items (catalog pick or free text), qty, unit price, extended
- [x] **Automatic band pricing**: unit price fills from the quantity band as qty changes (read-only for band items — mirrors the locked "Do Not Type" formula cells)
- [x] **Size selector** applies per-size upcharges; **below-minimum** warning
- [x] Charges & setup, discount, notes, reorder toggle
- [x] Authoritative server-side price recompute on save (bands + size re-derived server-side)
- [x] Quote statuses: Draft → Sent → Accepted / Rejected → Converted
- [x] Customer **typeahead search** (name or BP #), incl. attach/change customer
- [x] Email quote to customer (prefilled mail; logs created + emailed to CRM)
- [x] Delete draft quotes (drafts only)

### 3.3 Orders & Production Tracking
- [x] Convert accepted quote → order (SO number + public token)
- [x] 6-stage tracker (Received → Art & Proof → Production → Quality → Shipped → Delivered)
- [x] Stage advancement + events timeline + CRM logging
- [x] Sales-order PDF (generate, save as artifact, download)
- [~] Email PDF to customer + resend (works; **queues until email DNS live**)
- [x] Production details: in-hands date + special instructions
- [x] Production spec items (product, decoration method, placement, colors, sizes) — apparel & non-apparel
- [x] Art / mockup / reference attachments (image/PDF/AI/EPS/PSD) with previews
- [x] Production spec included on the sales-order PDF
- [x] Void order with required reason (locks actions, list badge, tracker shows "canceled")

### 3.4 Customer Order Tracker (public)
- [x] Login-free tracker page (/track/[token]), Domino's-style, Mountain time
- [x] Email tracker link to customer
- [x] **Pending proof shown on the tracker** — customer sees the proposed art and decides in-place

### 3.5 Proof / Art Approvals
- [x] Send a proof link from the order (choose artwork attachment)
- [x] Public approval page: Approve / Request changes / Decline + notes
- [x] **Request a meeting** option — surfaces the owner's booking link + notifies
- [x] Auditable capture: typed signature + IP + timestamp
- [x] Notifies requester + logs decision to CRM history

### 3.5a Art Department Workflow
- [x] **Catalogue image** per template item; carried onto the order on convert
- [x] **Submit to Art** from the order → creates art request, sets Art & Proof stage, notifies art team
- [x] **Art board** (/art): Queue (list) + Kanban (drag by status) over art_requests
- [x] Statuses: To do / In progress / Proofing / Revisions / Approved / Done
- [x] Assignment (art/production), rush flag, due date
- [x] Request detail: order + spec + catalogue/customer/proposed images; upload proposed art; send proof
- [x] Art-role-scoped actions (no Sales access needed); migration 0017 (art_requests + art_status, meeting_requested)

### 3.6 Sales Automations (drip campaigns)
- [x] Campaigns with triggers (lead-created / manual)
- [x] Steps by day offset: create task / notify owner / email customer
- [x] Auto-enroll new leads
- [x] Daily scheduler (Vercel Cron, secured)
- [x] Campaign builder under the Sales menu

---

## Phase 2 — Scheduling & Calendar

- [x] Personal scheduling profile (slug, timezone, notice, slot interval, window, active)
- [x] Weekly availability blocks
- [x] Meeting types (name, duration, color)
- [x] Public booking page (/schedule/[slug]) — pick type, slot, confirm
- [x] Timezone-safe, conflict-aware slot engine
- [x] Team calendar month grid with per-appointment cards, color by type, host filter, month nav
- [x] Meeting detail (attendee/host/company/notes) with clickable email & phone
- [x] Mark complete
- [x] Cancel (notifies host)
- [x] Reschedule (availability-aware slot picker)
- [ ] Two-way sync with real Outlook / Google calendars (backlog — needs OAuth app)

---

## Phase 2 — Secure Financial Intake

- [x] Document requests: Terms/Credit Application, Credit Card Application
- [x] Public secure form (/apply/[token]) — sections per document type
- [x] E-signature (typed name) + agree checkbox; captures IP
- [x] No card numbers collected/stored (directed out-of-band; PCI-safe)
- [x] Request from the account page or at account creation
- [x] Staff view of submissions + status + CRM logging

---

## Standard Reports (SAP-parity)

- [x] Sales Analysis by Salesperson & Customer — 3-fiscal-year (Oct–Sep) monthly pivot, 3-mo & YoY subtotals, per-customer/rep/grand totals, CSV
- [x] Open Orders by Salesperson — grouped salesperson → due month → territory → customer with subtotals; overdue highlighting; CSV
- [x] Open Orders by Type — grouped by product/decoration type, type filter, due-date sort, group + grand totals, CSV
- [x] Customer Credit Report — credit header, trailing 12/24/36-mo sales, open orders, live open invoices + aging, payments, activity, APA
- [x] Order fields to support the above (type, PO#, ship-via, date type, due date, amount, sales rep) + BP territory/credit fields

---

## Accounting — Accounts Receivable

- [x] Invoices (from a delivered order or standalone) with line editing, issue, and Net-terms due dates
- [x] Invoice PDF + email-to-customer (Resend); logs to CRM activity
- [x] Payments — per-invoice and on-account; partial payments; auto status (draft/sent/partial/paid/void)
- [x] Live customer account balance maintenance
- [x] AR Aging report (current / 1–30 / 31–60 / 61–90 / 90+) by customer with totals
- [x] Customer statements — page + PDF + email
- [x] Credit control — set limit / hold / terms / guarantee; enforcement blocks quote→order when on hold or over limit
- [ ] Accounts Payable, GL posting, dunning automation (backlog)

---

## Backlog (discussed, not yet built)

- [x] Quoting calculator: banded/quantity pricing + per-size upcharges + minimums (delivered — see §3.1/§3.2)
- [x] Quoting calculator (full): blank-garment catalog + vendor→garment cascade, white/light/dark color tiers, per-location decoration (silk screen/DTF/foil/softhand/embroidery), size classes, embroidery stitch tiers — admin at Catalog & Pricing
- [ ] Quoting calculator (remaining): confirm real softgoods decoration rates from the client's order form (seed has estimates); optional supplier-cost import
- [ ] Credit-app auto-chase reminders + welcome packet + new-lead auto-reply
- [ ] Reporting suite: marketing-source ROI, top-selling designs/products, rep activity
- [ ] Global NLP search across records (needs an Anthropic API key)
- [x] Native art-request Kanban (Trello replacement) — delivered (see §3.5a)
- [ ] Independent-rep deal-registration quick form
- [x] Credit gates / limits enforcement — delivered (see Accounting); [ ] Experian integration
- [ ] Phase 3+ modules: Web Store, Jobs & Production, Inventory/MRP, Content Library ([x] Accounting AR delivered)
