# Web Store — Native B2B eCommerce

**Wireframe:** https://g54-platform.vercel.app/ecommerce.html
**Epic refs:** 4.1–4.6
**Stakeholders:** Cody de Jong (eComm, Digital Catalogs), Chase de Jong (eComm), Leslie Weiler (Digital Catalogs)
**Live storefront URL:** store.g54.com

---

## Overview

The Web Store is MakeReady's native B2B eCommerce module. It replaces Zoey B2B (greatmountainwest.zoey.com) and the Vision33 Saltbox connector that previously synced Zoey with SAP Business One.

**Key difference from the old setup:** There is no sync. Web Store orders become Sales Orders in MakeReady directly — no middleware, no delay, no connector to maintain.

The storefront at store.g54.com is customer-facing. The Web Store module in MakeReady is the staff-facing management interface for that storefront.

---

## Key Concepts

| Concept | Description |
|---|---|
| **Account Group** | Controls which products a customer sees and what pricing tier they get. Set on the BP record in CRM. |
| **Price List** | A named set of unit prices for inventory items, associated with one or more Account Groups |
| **Web Store Order** | An order placed on store.g54.com; automatically creates a MakeReady Sales Order with prefix WEB- |
| **Publish** | Making an inventory item visible on the storefront for eligible Account Groups |
| **Inventory Publish Schedule** | Configures how often stock levels sync from MakeReady inventory to the storefront |

---

## User Stories

### US-WEB-01: Publish products to the storefront
**As a** Sales Manager or Admin  
**I want to** control which inventory items are visible on store.g54.com  
**So that** customers only see products we are ready to sell online

**Acceptance Criteria:**
- Given I am on the Web Store module, when I select an inventory item, then I can toggle it Published / Unpublished per Account Group
- Given an item is published, then it is visible on store.g54.com to customers in the selected Account Group(s)
- Given an item is unpublished, then it is hidden from the storefront immediately (within 60 seconds)
- Given an item has zero stock, then it shows as "Out of Stock" on the storefront (not removed from catalog)

---

### US-WEB-02: Account Group pricing
**As a** Sales Manager or Admin  
**I want to** assign different price lists to different Account Groups  
**So that** wholesale customers automatically see wholesale pricing and standard customers see retail pricing

**Acceptance Criteria:**
- Given an Account Group is configured with a price list, when a customer in that group browses the storefront, then they see the prices from their assigned price list
- Given a customer is not assigned to any Account Group, then they are shown the default (Standard) price list or denied access [TBD — confirm with Kim/Chase]
- Given a price list is updated, then the storefront reflects the new pricing within 60 seconds

---

### US-WEB-03: Web Store order management
**As a** Sales Manager or Sales Rep  
**I want to** view and manage incoming Web Store orders  
**So that** I can monitor online sales and handle exceptions

**Acceptance Criteria:**
- Given a customer places an order, when I view the Web Store orders list, then the order appears with: order number (WEB-), customer name, date, total, and status
- Given I click an order, then I see full line items, shipping address, and a link to the corresponding Sales Order in MakeReady
- Given an order is in Pending Approval status, when I approve it, then the Sales Order is released to production
- Given an order is in Pending Approval status, when I reject it, then the customer receives a notification [TBD — email template]

---

### US-WEB-04: Order approval rules
**As a** Sales Manager  
**I want** orders above a dollar threshold to require my approval before entering production  
**So that** large orders are reviewed before G54 commits resources

**Acceptance Criteria:**
- Given a Web Store order total is ≥ $5,000, when it is received, then the Sales Order is created in "Pending Approval" status
- Given a Pending Approval SO exists, when I am a Sales Manager, then I receive an in-app notification and (optionally) an email
- Given I approve the SO, then it moves to Confirmed and enters the production queue
- Given I reject the SO, then it moves to Cancelled and the customer is notified
- The $5,000 threshold must be configurable in Administration without a code change

---

### US-WEB-05: Inventory publish schedule
**As an** Admin  
**I want to** configure how frequently inventory stock levels are pushed to the storefront  
**So that** the storefront shows accurate availability without overwhelming the system

**Acceptance Criteria:**
- Given I am in Web Store Configuration, when I select an inventory publish schedule (Real-time, Every 15 min, Every hour, Daily), then stock level updates to the storefront run on that cadence
- Given an item goes to zero stock during a publishing interval, then it is marked Out of Stock on the next publish cycle
- Real-time publishing must not degrade MakeReady performance for other users

---

### US-WEB-06: Web Store configuration
**As an** Admin  
**I want to** configure the Web Store settings from within MakeReady  
**So that** I don't need to access a separate admin panel

**Acceptance Criteria:**
- Given I am in Web Store Settings, then I can configure:
  - Store URL (store.g54.com)
  - Store Display Name
  - Order Processing mode (Auto-approve below threshold / Manual review all)
  - Inventory Publish Schedule
  - SAP B1 Sales Order prefix (WEB-)
- Given I change the SO prefix, when saved, then all new Web Store orders use the new prefix (existing orders are unaffected)

---

### US-WEB-07: Web Store status sync back
**As a** customer who placed a Web Store order  
**I want to** see my order status updated on the storefront  
**So that** I know where my order is without calling G54

**Acceptance Criteria:**
- Given an order's status changes in MakeReady (e.g., In Production, Shipped), then the corresponding Web Store order status updates within 5 minutes
- Given a tracking number is added to the Delivery document, then the tracking number appears on the customer's Web Store order status page
- Status mapping: MakeReady SO status → Web Store display:
  - Confirmed → Order Confirmed
  - In Production → In Production
  - Ready to Ship → Preparing Shipment
  - Delivered (with tracking) → Shipped: [tracking number]
  - Delivered (no tracking) → Delivered

---

## Digital Catalogs

*Section owned by: Cody de Jong, Leslie Weiler*

Digital Catalogs is an adjacent feature to the Web Store — the ability to produce and share product catalogs (online or PDF) for sales presentations and storefront browsing. **Requirements for this section are pending stakeholder discovery with Cody and Leslie.**

| Item | Status |
|---|---|
| Digital Catalog format (online flipbook, PDF, both?) | [TBD — discovery with Cody/Leslie] |
| Catalog builder tool (staff-side) | [TBD] |
| Customer-facing catalog URL | [TBD] |
| Catalog vs. Web Store ordering (are they integrated?) | [TBD] |
| Connection to Content Library assets | [TBD] |

> **Discovery needed:** Schedule working session with Cody de Jong and Leslie Weiler to define Digital Catalog requirements fully before this section can be built.
