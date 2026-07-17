# Sales — Quotes, Orders, Delivery & Payments

**Wireframe:** https://g54-platform.vercel.app/sales.html
**Epic refs:** 3.1–3.8
**Stakeholders:** Kim Lund (Sales)

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
- Given I add line items, then I can search for inventory items by name or SKU, enter quantity, and the system applies the BP's Account Group pricing automatically
- Given I add a line item, when I manually override the unit price, then if the discount exceeds 10%, a Sales Manager approval flag is set
- Given I save a quote, then it receives a system-generated Quote number with prefix QUO-
- Given a quote is saved, when I send it, then the system generates a PDF and [TBD — email directly from MakeReady or download PDF for manual send]
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

## Status Reference

| Document | Status Flow |
|---|---|
| Quote | Draft → Sent → Accepted → Converted; or Declined; or Expired |
| Sales Order | Draft → Confirmed → In Production → Ready to Ship → Delivered; or Cancelled |
| Web Store SO | Pending Approval (if ≥$5k) → Confirmed → … same as above |
| Delivery | Draft → Shipped → Delivered |
| AR Invoice | Draft → Sent → Partially Paid → Paid; or Overdue; or Void |
| Incoming Payment | Posted (immutable after posting) |
