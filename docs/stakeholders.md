# Stakeholders & Discovery Contacts

Business requirements for MakeReady are organized into four groups. Each group owns the discovery, validation, and sign-off for their domain.

---

## Stakeholder Groups & Contacts

| Name | Email | Phone | Group(s) |
|---|---|---|---|
| Kim Lund | kim@g54.com | 480-292-6226 | Sales (Sales), Finance |
| Chase de Jong | chase@g54.com | 385-315-2670 | Sales (CRM, eComm) |
| Britney de Jong | britney@g54.com | 801-520-1073 | Finance (Accounting, AP), Operations (Process) |
| Leslie Weiler | leslie@g54.com | 801-558-0778 | Sales (Digital Catalogs), Finance (AR, Reports), Operations (Inventory) |
| Tyson Johnson | tyson@g54.com | 801-318-5803 | Operations (Production, Inventory, Process), Art (Library) |
| Cody de Jong | cody@g54.com | 801-560-6702 | Sales (eComm, Digital Catalogs), Art (Requests/Schedule, Library, Website) |
| Jon [TBD] | [TBD] | [TBD] | Art (Library) — last name and contact not yet provided |

> **Action item:** Confirm Jon's last name and contact info with Christopher Wall.

---

## Group 1 — Sales

| Section | Owner(s) | Requirements Doc | Status |
|---|---|---|---|
| Sales | Kim Lund | [requirements/sales.md](requirements/sales.md) | Initial draft complete |
| CRM | Kim Lund, Chase de Jong | [requirements/crm.md](requirements/crm.md) | Initial draft complete |
| eCommerce (Web Store) | Cody de Jong, Chase de Jong | [requirements/web-store.md](requirements/web-store.md) | Initial draft complete |
| Digital Catalogs | Cody de Jong, Leslie Weiler | [requirements/web-store.md](requirements/web-store.md#digital-catalogs) | **Discovery needed** |

### Discovery Outstanding — Sales
- **Digital Catalogs:** What format? (Online flipbook, PDF, both?) Who builds them? How do they connect to the Web Store? Do customers order directly from a catalog? Are they tied to the Content Library?
- **Account Groups:** What are the actual group names, and what pricing rules apply to each? (Kim, Chase)
- **Web Store access model:** Can any BP create an account, or are accounts invitation-only? (Chase, Cody)

---

## Group 2 — Finance

| Section | Owner(s) | Requirements Doc | Status |
|---|---|---|---|
| Accounting | Britney de Jong | [requirements/accounting.md](requirements/accounting.md) | Initial draft complete |
| Accounts Payable | Britney de Jong | [requirements/accounting.md](requirements/accounting.md) | Initial draft complete |
| Accounts Receivable | Leslie Weiler | [requirements/accounting.md](requirements/accounting.md) | Initial draft complete |
| Reports | Leslie Weiler | [requirements/reports.md](requirements/reports.md) | Stub — discovery needed |

### Discovery Outstanding — Finance
- **Historical data cutoff:** How far back does transaction history migrate from SAP B1? (Kim, Britney)
- **Bank reconciliation format:** How does G54 currently import bank statements? CSV? OFX? Manual? (Britney)
- **Payment methods used:** What payment types does G54 accept? (Check, ACH, credit card, wire?) (Leslie)
- **Tax setup:** How many sales tax rates/jurisdictions? Is tax calculated automatically or manually? (Britney)
- **Reports needed:** What specific reports does Leslie currently run? What decisions do they drive? (Leslie)
- **AP payment runs:** Does G54 do batch payment runs or pay invoices individually? (Britney)

---

## Group 3 — Operations

| Section | Owner(s) | Requirements Doc | Status |
|---|---|---|---|
| Production | Tyson Johnson | [requirements/jobs-production.md](requirements/jobs-production.md) | Initial draft complete |
| Inventory | Leslie Weiler, Tyson Johnson | [requirements/inventory.md](requirements/inventory.md) | Initial draft complete |
| Process | Britney de Jong, Tyson Johnson | [requirements/workflows.md](requirements/workflows.md) | Initial draft complete |

### Discovery Outstanding — Operations
- **Production job types:** What are the actual production stages at G54? (The wireframe shows: Prepress → Printing → Finishing. Are these correct? Are there others?) (Tyson)
- **Equipment/press assignment:** Do jobs need to be assigned to a specific press or piece of equipment? (Tyson)
- **Quality checkpoints:** What does quality management look like at G54? What gets inspected and when? (Tyson)
- **Equipment maintenance:** What types of equipment? How is maintenance currently tracked? (Tyson)
- **Inventory warehouses:** Does G54 have one location or multiple? (Leslie, Tyson)
- **Reorder process:** How are purchase orders currently created? To which vendors? (Leslie)
- **Process/workflows:** What approval steps currently require a human signature or email chain? (Britney, Tyson)

---

## Group 4 — Art

| Section | Owner(s) | Requirements Doc | Status |
|---|---|---|---|
| Requests / Schedule | Cody de Jong | — | **Discovery needed** |
| Library (DAM) | Cody de Jong, Jon [TBD] | [requirements/content-library.md](requirements/content-library.md) | Initial draft complete |
| Website | Cody de Jong, Leslie Weiler | — | **Discovery needed** |

### Discovery Outstanding — Art
- **Requests / Schedule:** How does the art department receive requests today? Email? Verbal? A spreadsheet? What does a "request" contain — client name, job number, turnaround, specs? Is there a scheduling component (capacity planning, queue management)? (Cody)
- **Library:** What file types are most common? What's the approximate current asset count? How are assets currently organized (folders, Dropbox, Google Drive)? Are assets currently tagged or named with any convention? (Cody, Jon)
- **Website:** Is this g54.com itself — maintaining G54's own marketing website from within MakeReady? Or a customer-facing website builder for clients? What CMS or platform is the current g54.com on? What content needs to be manageable? (Cody, Leslie)

---

## Recommended Discovery Session Plan

| Session | Attendees | Topics | Duration |
|---|---|---|---|
| Sales Discovery | Kim, Chase | Sales process, Account Groups, Web Store access model | 1.5 hr |
| Digital Catalogs | Cody, Leslie | Catalog format, builder, ordering flow | 1 hr |
| Finance Deep Dive | Britney, Leslie | AP workflow, bank reconciliation, reports needed, historical data | 2 hr |
| Production Floor | Tyson | Job stages, equipment, quality, maintenance | 1.5 hr |
| Inventory & Supply | Leslie, Tyson | Warehouse setup, vendors, reorder process | 1 hr |
| Art — Requests | Cody | Request intake, scheduling, capacity | 1 hr |
| Art — Website | Cody, Leslie | g54.com CMS, what needs managing | 1 hr |
| Art — Library (confirm) | Cody, Jon | Confirm DAM requirements, current asset state | 1 hr |
