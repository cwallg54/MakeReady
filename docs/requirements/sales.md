# Sales — Quotes, Orders, Delivery & Payments

**Wireframe:** https://g54-platform.vercel.app/sales.html
**Epic refs:** 3.1–3.12
**Stakeholders:** Kim Lund (Sales, executive sponsor)

---

## Overview

The Sales module manages the full quote-to-cash document flow for G54:

**Quote → Sales Order → Delivery → AR Invoice → Incoming Payment**

Sales Orders originate in two ways: (1) manually by a Sales Rep or Manager, and (2) automatically when a customer places an order on the Web Store. The module also surfaces field sales capabilities for Reps working at client sites.

---

## Document Flow

```
Quote (optional)
  └─► Sales Order ──► Production Job (auto-created)
        └─► Delivery
              └─► AR Invoice
                    └─► Incoming Payment (marks invoice Paid)
```

All documents are linked; navigating from an invoice back to the originating SO is always possible.

---

## User Stories

### US-SALES-01: Create a Quote
**As a** Sales Rep or Sales Manager  
**I want to** create a quote for a customer  
**So that** I can present a formal price before they commit to an order

**Acceptance Criteria:**
- Given I create a quote, then I must select a BP; optional: select a specific contact
- Given I build the quote, then I use the **Garments & Decoration** builder (US-SALES-09) — garment + color + size run + decoration lines — not a generic line-item grid
- Given garments and decoration are entered, then the **Pricing Calculator Engine** (US-SALES-11) computes unit and extended prices automatically; the rep does **not** hand-type prices
- Given pricing is engine-computed, then the rep **cannot edit the unit price** (see pricing-discretion decision in US-SALES-11); any exception routes to a Sales Manager/Admin
- Given I save a quote, then it receives a system-generated Quote number with prefix QUO-
- Given a quote is saved, when I send it, then the customer receives an **in-system link** to view/approve it (not an emailed form); a PDF copy may also be generated
- Quote status flow: Draft → Sent → Accepted → Converted to SO | Declined | Expired

---

### US-SALES-02: Convert Quote to Sales Order
**As a** Sales Rep or Sales Manager  
**I want to** convert an accepted quote to a Sales Order  
**So that** the order enters the production queue without re-entering data

**Acceptance Criteria:**
- Given a quote is in Accepted status, when I click "Convert to Sales Order," then all line items, pricing, and BP details carry over to the new SO automatically
- Given the SO is created from a quote, then the SO record shows a link back to the originating quote
- Given the SO is created, then a production job is automatically created and appears in the Jobs & Production queue

---

### US-SALES-03: Create a Sales Order manually
**As a** Sales Rep or Sales Manager  
**I want to** create a Sales Order without a preceding quote  
**So that** I can take verbal or email orders quickly

**Acceptance Criteria:**
- Given I create an SO, then the same BP, line item, and pricing rules as quote creation apply
- Given I save the SO, then it receives a system-generated SO number with prefix SO-
- Given the SO is saved, then a production job is automatically created

---

### US-SALES-04: Web Store order becomes a Sales Order
**As a** Sales Manager  
**I want** Web Store orders to appear as Sales Orders automatically  
**So that** no manual re-entry is required for online orders

**Acceptance Criteria:**
- Given a customer places an order on store.g54.com, within 60 seconds, then a Sales Order appears in MakeReady with prefix WEB-
- Given the Web Store SO is created, then it contains: all line items, quantities, customer BP link, shipping address, and Web Store order reference number
- Given the Web Store SO is created, then it follows the same document flow (→ Delivery → Invoice → Payment) as any other SO
- Given a Web Store order requires approval (≥ $5,000), then the SO is created in "Pending Approval" status and does NOT proceed to production until approved

---

### US-SALES-05: Create a Delivery
**As a** Sales Rep or Production member  
**I want to** create a Delivery document from a completed Sales Order  
**So that** goods are formally dispatched and the AR Invoice can be generated

**Acceptance Criteria:**
- Given an SO is in Ready to Ship status, when I create a delivery, then all SO line items are pre-populated
- Given I save the delivery, then it receives a system-generated number with prefix DEL-
- Given I enter a tracking number, when I save, then the tracking update is sent back to the Web Store (for Web Store orders)
- Given the delivery is saved, then the SO status updates to Delivered

---

### US-SALES-06: Generate an AR Invoice
**As a** Finance/Accounting member or Sales Manager  
**I want to** generate an AR Invoice from a Delivery  
**So that** the customer is formally billed

**Acceptance Criteria:**
- Given a delivery exists, when I create an invoice, then all line items, quantities, and pricing carry over from the delivery
- Given I save the invoice, then it receives a system-generated number with prefix INV-
- Invoice status flow: Draft → Sent → Partially Paid → Paid | Overdue | Void

---

### US-SALES-07: Record an Incoming Payment
**As a** Finance/Accounting member  
**I want to** record a payment against an AR Invoice  
**So that** the invoice is marked paid and cash position is updated

**Acceptance Criteria:**
- Given an invoice is in Sent or Partially Paid status, when I record a payment, then I enter: amount, payment date, payment method (Check, ACH, Credit Card, Wire, Other), and optional reference number
- Given the payment amount equals the invoice balance, when I save, then the invoice status changes to Paid
- Given the payment amount is less than the invoice balance, when I save, then the invoice status changes to Partially Paid and the remaining balance is shown
- Given a payment is recorded, then it posts to the AR account in Accounting

---

### US-SALES-08: Field sales order submission (mobile)
**As a** Sales Rep in the field  
**I want to** create a Sales Order and attach client artwork from my tablet or phone  
**So that** the order is in the system before I leave the client location

**Acceptance Criteria:**
- Given I am logged in as a Sales Rep on a tablet browser, when I navigate to Sales → New Order, then the form is usable on a 768px-wide screen without horizontal scrolling
- Given I am creating an SO, when I search for a BP, then the BP typeahead works on mobile
- Given I tap "Attach Artwork," when I select a file from my device, then the file uploads and attaches to the SO
- Given I submit the SO, then I receive a confirmation with the SO number visible on screen

---

### US-SALES-09: Garment & Decoration quote builder
**As a** Sales Rep
**I want to** build an order by picking a garment, its color, and a size run, then attaching decoration lines — all from the catalog
**So that** I stop free-typing style numbers and sizes into notes and stop hand-reconciling print counts

> **Replaces today's Zoey process.** Today the rep free-types the style (e.g. "5000"), color, and per-size quantities, then re-types print instructions into a notes box, then hand-checks on a calculator that the decoration counts equal the garment counts. Kim's direction: collapse this into one catalog-driven builder and drop the separate generic line-item section entirely.

**Acceptance Criteria:**
- Given I add a garment, when I search the catalog, then I select the style (e.g. Gildan 5000), then a **color** from that style's colors, from dropdowns — no free typing where a catalog value exists
- Given a garment + color is chosen, then I enter a **size run** (S, M, L, XL, 2X, 3X …) with a quantity per size; the garment subtotal sums the run
- Given I need another garment, when I click **Add garment**, then a second garment+color+run block is added (multiple garments per order)
- Given a garment block exists, then I attach one or more **decoration lines** beneath it, each specifying: method (Silk Screen / Embroidery), **design number** (selected from the design catalog when it exists), **print location(s)** (e.g. Left Chest, Full Back), and the design's **screen-color class (A/B/C)** which drives pricing
- Given a decoration line specifies a print, then the system computes the **number of prints** and **validates that total prints equal the total garment quantity** for that garment; a mismatch is flagged and blocks save (today this is a manual calculator step)
- Given a decoration references a design, then the correct **approved artwork** is linked to the order (see US-SALES-12); the order is the source of truth for which artwork prints
- Given I move between fields, then tab-key navigation works through the whole builder (keyboard-first data entry)
- Given the builder renders on a tablet, then it is usable without horizontal scrolling (reps quote from tablets in the field)

---

### US-SALES-10: Reorder fast-path
**As a** Sales Rep
**I want to** flag an order as a reorder and skip re-approval steps the customer has already done
**So that** a customer who just says "run my usual again" gets it moving immediately

**Acceptance Criteria:**
- Given I create an order, when I mark it **Reorder**, then it links to the prior order and carries over garments, decoration, artwork, and pricing basis
- Given an order is a reorder with unchanged artwork, then **customer proof approval is skipped** and the job defaults to **no press check** (see jobs US-JOB-07)
- Given a reorder is placed, then the customer still receives an **in-system copy** of the order for their records (no approval action required from them)
- Given a reorder's artwork or garment changed, then it is treated as a new order (proof approval + press check re-enabled)
- Given the business rules for reorder routing differ from new orders (new vs. reorder route to different internal queues today), then the reorder flag is available to downstream Jobs/routing — [TBD: exact routing differences to confirm with Ops]

---

### US-SALES-11: Pricing Calculator Engine
**As a** Sales Manager / Admin
**I want** the platform to compute order pricing from maintained cost tables and rules
**So that** we retire the "SS Silk Screen Calculator" spreadsheet (currently on version 11, updated by hand ~twice a year) and remove rep pricing error

**Acceptance Criteria:**
- Given garments and decoration are entered, then the engine computes price from: **garment cost**, **quantity price band** (unit price drops as quantity rises), **size upcharges** (e.g. 2X = +$2 over the S–XL base), decoration/print charges by **screen-color class (A/B/C)** and print location, and **extras**
- Given extras apply, then each extra is a maintained item with a set cost that auto-adds to the garment/line (examples from today: **barcode $0.15**, **fold $0.15**, **hang tag**, **UPC**, **name drop**)
- Given a vendor **freight threshold** applies, then the engine auto-applies it — e.g. a supplier that gives free freight at ≥ $250 cost otherwise adds ~$1/garment; the rep does not remember or key this
- Given a design carries an **artist royalty**, then the engine adds the artist's royalty (a per-artist percentage/amount) to the price — [TBD: source these royalty rates; currently in a hidden spreadsheet maintained by Leslie]
- Given costs change, then an **Admin panel** maintains the garment cost table, extras, freight thresholds, quantity bands, and royalties (today Alex updates a "garment cost" tab ~twice a year; changes must not require a code deploy)
- Given a rep quotes, then a **quick-reference price lookup** is available ("how much for X shirts?") that reads from the same tables (replaces the reps' quick-quote sheets)
- **Pricing-discretion decision (from Kim call):** reps get a **very short leash**. Default: reps **cannot change price** — price is engine-set. The historical "trade commission for a discount" option (rep takes a 2–3% commission cut to lower price) is **rarely used and not being built**; Kim's lean is to make price editing unavailable to anyone outside the person who sets pricing. Any discount is an Admin/Manager action.

---

### US-SALES-12: Order fulfillment details & artwork as source of truth
**As a** Sales Rep / Production
**I want** warehouse and ship instructions captured as structured fields on the order, with the approved artwork attached
**So that** the warehouse and press work from one accurate record instead of free-text notes

**Acceptance Criteria:**
- Given I build an order, then fulfillment needs are **structured fields** (not a free-text note blob): barcodes required (y/n), **per-size UPC** values, **G54 hang tags**, **name drop** text, folding — each feeding the pricing engine's extras
- Given barcodes/UPCs are needed, then the platform can generate/look up the UPC per size (today the warehouse hand-keys size + number into SAP to print the UPC label) — [TBD: barcode engine, tie to Design Library barcode book]
- Given the order has decoration, then the **approved artwork** (with its Art-assigned design/customer number) is attached to the order and is the **single source of truth** — Art assigns a design number and there may be many name-drops per base design, so the specific approved file must be pinned to the order
- Given a **ship date** is set, then it derives from the weekly production/ship calendar (Ops publishes ship dates each Monday) rather than free entry — [TBD: integrate Ops ship-date schedule]
- Given the order is silk-screen and new, then **Press check required** defaults to yes (see US-JOB-07); the rep/Ops can toggle it

---

## Status Reference

| Document | Status Flow |
|---|---|
| Quote | Draft → Sent → Accepted → Converted; or Declined; or Expired |
| Sales Order | Draft → Confirmed → In Production → Ready to Ship → Delivered; or Cancelled |
| Web Store SO | Pending Approval (if ≥$5k) → Confirmed → … same as above |
| Delivery | Draft → Shipped → Delivered |
| AR Invoice | Draft → Sent → Partially Paid → Paid; or Overdue; or Void |
| Incoming Payment | Posted (immutable after posting) |
