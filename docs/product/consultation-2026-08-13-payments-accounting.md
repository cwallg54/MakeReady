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

## Terms, invoicing & reminders (next)
- Invoices carry **terms** (Net 30/60, or prepay/credit-card-before-ship). Send
  the pay link **at invoice**. *(Invoice terms + due date + pay link already
  exist; the automated reminder cadence is the remaining piece.)*
- **Automated reminders** off the due date: ~15 days before, ~5 days before,
  day-1 past due, then **late-fee** application at a configured day. Build on the
  existing sales/AR automation engine.
- **Manual payment posting** for checks (Stacey posts a batch of ~30 to each
  account → shows paid) — already exists in Accounting → Payments.

## Accounting / month-end wishlist (to build)
- **Invoicing, AR, AP** — core exists; confirm month-end views.
- **WIP / open orders** ("goods not yet sold; work in progress") — an open-orders
  report is the WIP view. **GRNI** (goods received, not invoiced) on the AP side.
- **Recurring journal entries** — auto-post the same monthly entries to the GL
  (rent, etc.) without re-keying.
- **In-house production order** — today an in-house job needs a manual SO **and**
  PO to move blanks out of stock and finished goods in, plus a ~$20–30k/mo manual
  COGS journal entry through a clearing account ("we don't invoice ourselves").
  Replace with a single **production order** that knows blanks come out and
  finished goods go in, and posts the COGS automatically.
- **Sales-tax report** (quarterly) — exempt sales + taxable + taxable freight,
  with **drill-down** to the source transactions.
- **Commission report** — monthly, by salesperson (pulled ~1st for the 10th
  payroll).
- **Open orders by type** — in-house vs in-country, soft goods vs other, with
  **status** (e.g. past-due but on-hold). Report already partly built.

## Reporting & drill-down (a recurring theme)
- **Drill-down everywhere**: click a number in a report → see its source rows;
  from an item → its **inventory audit** (every in/out movement) → drill into the
  delivery / goods receipt; from an item → every **PO** (spot the open ones).
  Like SAP's drill-down but **without 40 pop-up windows** (one screen, click to
  expand).
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
