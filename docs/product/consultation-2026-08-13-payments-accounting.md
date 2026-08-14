# Consultation — Payment Processing & Accounting/Month-End, 2026-08-13

Working session (Chris + G54 AR/accounting) covering online payments and the
finance/month-end wishlist. Below are the decisions and resulting scope. Target
raised in the call: get the priority pieces usable within ~30 days.

## Build status (2026-08-13)

- ✅ **Customer online invoice payment** — shipped (commit `2a57b40`). Public
  pay page `/invoice/[token]`: **bank/ACH (Plaid-backed, no fee)** or **card
  (with a configurable processing fee)**. Reachable from the order tracker and
  the invoice email ("Pay online"). Card surcharge editable in Admin →
  Configuration. Graceful until Stripe keys are set. This resolves the
  "customers want to pay by check, not a virtual card" friction — a real bank
  path with no card surcharge, and the fee is transparent on card.

## The payment problem (context)
Customers send access to their AP portals (Bill, Ramp, BillGo, Melio…) expecting
a "check," but what G54 receives is a **virtual card** (Visa/MC-backed) which
still incurs card fees — and each vendor portal differs. Decision: **don't log
into customers' portals**; instead have customers **pay on our portal**. Offer
bank/ACH (no fee) and card (fee shown). Keeps liability and data entry on the
customer, and payment info stays in-system.

## Terms, invoicing & reminders  ✅ SHIPPED
- Invoices carry **terms** (Net 30/60…) + due date + the online pay link.
- **Automated reminders** — daily cron (`/api/cron/ar-reminders`) sends one
  escalating reminder per milestone (due-soon ≤15d, ≤5d/today, past-due), each
  with the pay link, by **email + SMS** (when configured), deduped per invoice.
- **Late fee** — applied once when an invoice is past due by the configured days
  (default 15): adds a late-fee line, bumps the total, posts Dr AR / Cr Late Fee
  Income. %/days set in Admin → Config.
- **Manual payment posting** for checks — already in Accounting → Payments.

## Accounting / month-end wishlist (to build)
- **Invoicing, AR, AP** — core exists; confirm month-end views.
- **WIP / open orders** ("goods not yet sold; work in progress") — an open-orders
  report is the WIP view.
- ✅ **Purchase orders + goods receipt / GRNI** — SHIPPED. `/inventory/purchase-orders`:
  raise a PO to a vendor, issue it, then **receive goods into stock** (moving stock
  in, revaluing item cost, advancing the PO to received). Receiving posts **Dr
  Inventory / Cr GRNI** (goods received, not invoiced — auto-created clearing
  liability); code the vendor's A/P bill to GRNI to clear it. Each inventory item
  now shows its **purchase orders** (spot the open ones + qty on order) — the
  item→PO drill-down.
- ✅ **Recurring journal entries** — SHIPPED (b57f5fa). `/accounting/recurring`:
  save a balanced template + day-of-month; a daily cron auto-posts it once per
  month (post-now button too). Retires the manual monthly re-keying.
- ✅ **In-house production order** — SHIPPED (2e3846b). `/inventory/production`: one
  document with blank (consume) + finished-good (produce) lines by SKU + bin.
  Posting moves real stock, rolls the blank cost (+ optional capitalized labor)
  into each finished item's cost, and posts Dr Inventory / Cr Production Labor
  Applied for added labor. Blank value transfers within inventory (no COGS until
  sale) — replaces the manual SO+PO and the ~$20–30k/mo COGS journal.
- ✅ **Sales-tax report** — SHIPPED (eca6d59). `/accounting/sales-tax`: taxable
  vs exempt sales + tax collected for a period (defaults to the quarter), with a
  drill-down invoice list. *(Taxable-freight line not separated — invoices don't
  carry a distinct freight line yet.)*
- ✅ **Commission report** — SHIPPED (eca6d59). `/accounting/commission`: order
  sales by salesperson for a period, expandable to the per-rep orders. Apply
  each rep's commission rate to their total.
- ✅ **Open orders by type** — already built (Reports → Open Orders by Type).

## Reporting & drill-down (a recurring theme)
- **Drill-down everywhere**: click a number in a report → see its source rows;
  from an item → its **inventory audit** (every in/out movement); from an item →
  every **PO** (spot the open ones) — ✅ shipped on the item page. Like SAP's
  drill-down but **without 40 pop-up windows** (one screen, click to expand).
- **Clean house**: don't replicate unused SAP reports; build the ones actually
  used (Leslie to confirm the priority list).

## Inventory costing — landed cost / freight spreading  ✅ SHIPPED
Built at **Accounting → Landed Cost** (`/accounting/landed-cost`). A worksheet:
enter the shipment (freight company, container ref, freight + duty/brokerage),
add the items (SKU auto-resolves the inventory item + base cost), choose to spread
**by quantity or value**, and see each line's landed unit cost. **Apply** freezes
the allocation and revalues each matched item's cost to its landed cost (base +
freight share); on-hand is left to the receiving/bin flow to avoid desync. Each
inventory item shows a **rolling 365-day landed average + year-over-year** (from
applied sheets — not the all-time "back-to-2008" average). **GL posting is live**:
apply posts **Dr Inventory / Cr Landed Cost Clearing** (the clearing account is
auto-created = their SAP 2398 analog). Code the freight/duty A/P bill to the same
Landed Cost Clearing account so it nets to zero — no double-counting.

## Pricing / discounts (continues the Kim thread)
- **Price adjustment** (not "discount") on the order form — reps can adjust up to
  a small cap (**2%**, comes out of their commission); larger discounts eat more
  commission; hard cap enforced. Contract/special pricing = a **% off list**
  showing the savings, not a separate catalog. Whale exceptions (e.g. Pilot
  hoodies fixed $18.95) handled as **exceptions/templates (Plan B)**, not a core
  feature. Keep 80% standard; add exceptions after.
- **Garment-specific colors & sizes** — each garment should carry its own color
  and size list (vendor-driven) rather than one global list. *(A standard color
  palette + catalog import already shipped; per-garment vendor color lists are
  the next step.)*
- **Conditional order-form logic** — pick the order type first, then show only
  relevant fields (sizes for apparel, not mugs; silkscreen vs embroidery fields).

## Automation / workflows
- **One-click workflows** chaining steps that today are separate (e.g. create
  customer → trigger credit approval in one action). Build steps individually,
  then compose them into workflows.
- **Claude Team account** set up in this session; AI natural-language search over
  logs/CRM being wired (asks like "when did Grand Canyon West last order?").
- **Twilio SMS** and **email/calendar sync** — phase-2 notification channels
  (both already scaffolded; activate with credentials).

## Department profitability & staffing (analysis Chris will model)
- Per-department cost model (silkscreen is ~60–65% of business): burn-room time,
  screen count, setup + print time, pieces → averages → true unit cost. QC was a
  hidden bottleneck (not printing). Warehouse = **operational overhead**,
  allocated to departments by % usage. Feeds order/customer profitability.
- Kim/Leslie/Alex to send: the **silkscreen cost spreadsheet** (labor math),
  **open-orders-by-type** report, **commission** report, and sample **tax** /
  **inventory-audit** reports so the app's versions match how they work.

## Follow-ups / inputs needed
- Stripe account + keys (+ enable ACH/us_bank_account) to turn on online pay.
- Bank **Plaid** support + API (AR person checking with the bank).
- Leslie's report priority list; Alex's/Leslie's silkscreen labor spreadsheet;
  sample tax, commission, open-orders, and inventory-audit reports.
