# Inventory & MRP

**Wireframe:** https://g54-platform.vercel.app/inventory.html
**Epic refs:** 6.1–6.3 (MVP); 6.4–6.6 (Phase 2)
**Stakeholders (Operations/Inventory):** Leslie Weiler, Tyson Johnson

---

## Overview

Inventory tracks G54's Item Master — the products and materials the company sells and uses in production. Items are published to the Web Store for B2B ordering. Stock levels drive the MRP (Material Requirements Planning) suggestions for reordering.

---

## User Stories

### US-INV-01: Item Master
**As an** Admin or Inventory manager  
**I want to** maintain a catalog of all items G54 sells and uses  
**So that** inventory, sales orders, and the Web Store all reference the same item records

**Acceptance Criteria:**
- Given I create an item, then required fields are: Item Name, Item Code (SKU), Unit of Measure, Item Type (Product / Raw Material / Service)
- Optional fields: Description, Default Price, Cost, Weight, Dimensions, Category, Barcode
- Given I save an item, then it is available to select in Sales Order line items
- Given the SAP B1 migration is complete, then all existing items are imported with their codes and descriptions preserved
- Given I deactivate an item, then it is removed from Sales Order selection and the Web Store but historical records are unaffected

---

### US-INV-02: Stock Levels
**As a** Production or Inventory manager  
**I want to** see current stock levels for all items  
**So that** I know what's available for upcoming jobs and what needs to be reordered

**Acceptance Criteria:**
- Given I view inventory, then for each item I see: On-Hand quantity, Committed quantity (reserved for open SOs), Available quantity (On-Hand minus Committed)
- Given an item's Available quantity falls below its reorder point, then it is visually flagged (e.g., low stock indicator)
- Available = On-Hand − Committed (this calculation must be real-time, not cached)

---

### US-INV-03: Publish items to Web Store
**As a** Sales Manager or Admin  
**I want to** control which inventory items are visible on store.g54.com  
**So that** customers only see products we are ready to sell online

**Acceptance Criteria:**
- Given I view an item, when I toggle "Published to Web Store," then the item becomes visible on the storefront for eligible Account Groups (or is hidden if unpublished)
- Given I publish an item, then the current stock level (Available quantity) is pushed to the storefront per the configured publish schedule
- Given an item is out of stock (Available = 0), then it shows "Out of Stock" on the storefront rather than being hidden

---

### US-INV-04: MRP — Reorder suggestions [PHASE 2]
**As a** Production or Inventory manager  
**I want to** receive reorder suggestions based on committed orders and lead times  
**So that** I don't run out of materials mid-production

**Acceptance Criteria (Phase 2):**
- Given items have reorder points and lead times configured, when Available quantity drops below reorder point, then MRP generates a suggested Purchase Order
- MRP suggestions are advisory; a user must confirm before a PO is created

---

### US-INV-05: Purchase Orders [PHASE 2]
**As an** Inventory manager  
**I want to** create Purchase Orders to vendors  
**So that** procurement is tracked and goods receipts can be recorded

*(Full acceptance criteria to be defined in Phase 2 discovery)*

---

### US-INV-06: Goods Receipt [PHASE 2]
**As an** Inventory manager  
**I want to** record received goods against a Purchase Order  
**So that** on-hand quantities are updated when stock arrives

*(Full acceptance criteria to be defined in Phase 2 discovery)*
