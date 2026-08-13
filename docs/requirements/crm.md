# CRM — Customer Relationship Management

**Wireframe:** https://g54-platform.vercel.app/crm.html
**Epic refs:** 2.1–2.7
**Stakeholders:** Kim Lund (Sales, executive sponsor), Chase de Jong (CRM)

---

## Overview

The CRM module manages G54's Business Partners (customers). Every customer account in MakeReady is a Business Partner (BP), mirroring the SAP Business One entity model. BPs are the anchor point for Sales Orders, AR Invoices, and Web Store accounts. The Account Group assigned to a BP controls what pricing and catalog the customer sees in the Web Store.

### Pipeline stage definitions (from Kim call, 2026-08-12)

The CRM pipeline has three swim lanes. Records move along them as the relationship gets more real:

| Stage | Definition | Typical trigger |
|---|---|---|
| **Lead** | Cold/early contact. A scanned business card, a trade-show fishbowl drop, a name from a road trip. | Card scanned (OCR), web-lead form, manual add |
| **Prospect** | Has expressed a real need; a conversation or meeting is underway. | Customer starts interacting / a meeting is scheduled; credit/terms application sent |
| **Customer** | Credit/terms approved and a customer number assigned. | AR (e.g., Stacy) reviews the credit app, assigns a customer number, and assigns a sales rep |

Movement between lanes is manual today (the triggers exist for later automation). The credit/terms application is completed **in-system** via a link (email or public website link), never via an emailed form.

---

## User Stories

### US-CRM-01: Create a Business Partner
**As a** Sales Rep or Sales Manager  
**I want to** create a new customer Business Partner record  
**So that** I can associate sales orders, invoices, and Web Store access with that customer

**Acceptance Criteria:**
- Given I am on the CRM module, when I click "New BP," then a creation form opens
- Required fields: Company Name, Account Group, Primary Contact Name, Primary Contact Email
- Optional fields: Phone, Address, Credit Limit, Payment Terms, Internal Notes
- Given I save the BP, when save succeeds, then the BP receives a system-generated BP number and appears in the BP list
- Given I enter a duplicate company name, when I attempt to save, then a warning is shown (not a hard block — duplicates are allowed with confirmation)

---

### US-CRM-02: View and edit a Business Partner
**As a** Sales Rep or Sales Manager  
**I want to** view and update a customer's BP record  
**So that** contact information and account settings stay current

**Acceptance Criteria:**
- Given I search for or select a BP, then I see: company name, BP number, account group, credit limit, payment terms, primary contact, all contacts, activity log, linked sales orders (last 5), and Web Store status
- Given I am a Sales Rep, then credit limit and account balance are hidden
- Given I edit and save a BP, then the change is written to the audit log with my name and timestamp

---

### US-CRM-03: Manage contacts per BP
**As a** Sales Rep  
**I want to** add multiple contacts to a Business Partner  
**So that** I have the right person's details for each department at a customer account

**Acceptance Criteria:**
- Given I am on a BP record, when I add a contact, then I can enter: first name, last name, title, email, phone, and mark as primary
- Given a BP has multiple contacts, then only one can be marked as primary
- Given I delete a contact, then a confirmation is required before deletion
- Contacts do not have system login access (they are data records only, not user accounts)

---

### US-CRM-04: Account Groups
**As a** Sales Manager or Admin  
**I want to** assign a Business Partner to an Account Group  
**So that** their pricing tier and Web Store catalog access are automatically controlled

**Acceptance Criteria:**
- Given Account Groups exist in the system, when I create or edit a BP, then I can select one Account Group from the list
- Given I change a BP's Account Group, when I save, then their Web Store pricing and catalog access updates on next Web Store login
- Account Group list is managed in Administration
- Account Groups available: [TBD — to be defined by Sales/Finance stakeholders; examples: Standard, Wholesale, Government, VIP]

---

### US-CRM-05: Activity log
**As a** Sales Rep  
**I want to** log notes, calls, emails, and visits against a BP  
**So that** anyone on the team can see the full history of our relationship with that customer

**Acceptance Criteria:**
- Given I am on a BP record, when I add an activity, then I can choose type (Note, Call, Email, Visit, Other) and enter free-text content
- Given an activity is saved, then it shows: type icon, text, my name, and timestamp — and it cannot be edited or deleted (immutable log)
- Given a BP has activities, then they are shown newest-first
- Given another Sales Rep views the same BP, then they see all activities from all team members

---

### US-CRM-06: Web Store link
**As a** Sales Manager  
**I want to** see the Web Store status for each Business Partner  
**So that** I know which customers are active on store.g54.com

**Acceptance Criteria:**
- Given a BP record, then the Web Store status shows: Published / Not Published / Pending
- Given a BP is published to the Web Store, then their Account Group, price list, and storefront status are visible on the BP record
- Publishing/unpublishing a BP to the Web Store is controlled from the Web Store module, not CRM

---

### US-CRM-07: OCR business-card capture
**As a** Sales Rep in the field
**I want to** snap a photo of a business card and have the system auto-create a Lead from it
**So that** the stack of cards I collect on the road turns into CRM records without me typing every field

> **From the Kim call.** Reps still collect and hand out a lot of business cards. Today they sit down at the end of the day and type card details into the system by hand. Kim and Chris agreed: add OCR so a phone/tablet photo populates as much of the record as possible.

**Acceptance Criteria:**
- Given I am on CRM on a phone or tablet, when I tap **New from business card**, then I can take a photo or pick one from the device (iOS + Android; the app must be granted photo/camera access)
- Given a card photo is captured, then OCR extracts and pre-fills as many fields as it can: company name, contact first/last name, title, email, phone, address, website
- Given OCR pre-fills the form, then I can review and correct fields before saving (OCR is a draft, not a commit)
- Given I save, then a new record is created as a **Lead** by default (rep can promote to Prospect if the conversation warranted it)
- Given the original card photo, then it is attached to the record for reference
- **[Nice-to-have]** Batch mode: capture several cards in a row, then review the resulting Leads as a list

---

## Data Model Reference

See [technical/data-model.md](../technical/data-model.md) for full entity definitions.

Key CRM entities: `business_partner`, `contact`, `account_group`, `activity_log`
