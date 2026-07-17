# MakeReady by G54 — Development Handoff Package

**Client:** Great Mountain West (G54.com)
**Product:** MakeReady — Print MIS / ERP Platform
**Live Wireframes:** https://g54-platform.vercel.app
**Repository:** https://github.com/ckwall222/gmw (ckwall222 account — do not mix with other accounts)
**Last Updated:** 2026-07-17

---

## What This Package Is

MakeReady is a purpose-built Print Management Information System (Print MIS) and ERP for Great Mountain West, a commercial print and graphics production company. This package contains everything a development firm needs to build the platform without back-and-forth discovery.

The wireframes at the link above are living prototypes — every feature described in this documentation is reflected there. When reviewing requirements, open the corresponding wireframe page alongside the relevant doc.

---

## Package Index

### Product
| Document | Description |
|---|---|
| [Vision & Scope](product/vision.md) | What MakeReady is, the problem it solves, success metrics, and out-of-scope boundaries |
| [Epics & Features](product/epics.md) | Full feature tree organized by epic — the complete scope of the build |
| [Roadmap](product/roadmap.md) | Phased delivery plan — what ships in each phase |

### Requirements (per module)
| Document | Wireframe | Description |
|---|---|---|
| [RBAC & Auth](requirements/rbac.md) | [/auth.html](https://g54-platform.vercel.app/auth.html) | All roles, permissions matrix, login and access control |
| [CRM](requirements/crm.md) | [/crm.html](https://g54-platform.vercel.app/crm.html) | Business partner management, contacts, activity log |
| [Sales](requirements/sales.md) | [/sales.html](https://g54-platform.vercel.app/sales.html) | Sales orders, quotes, delivery, AR document flow |
| [Web Store](requirements/web-store.md) | [/ecommerce.html](https://g64-platform.vercel.app/ecommerce.html) | Native B2B eCommerce — catalog, orders, account groups |
| [Jobs & Production](requirements/jobs-production.md) | [/jobs.html](https://g54-platform.vercel.app/jobs.html) | Work orders, production queue, job tracking |
| [Inventory & MRP](requirements/inventory.md) | [/inventory.html](https://g54-platform.vercel.app/inventory.html) | Item master, stock, MRP, Web Store publishing |
| [Accounting](requirements/accounting.md) | [/accounting.html](https://g54-platform.vercel.app/accounting.html) | AP/AR document flow, payments, SAP B1 migration |
| [Controlling](requirements/controlling.md) | [/controlling.html](https://g54-platform.vercel.app/controlling.html) | Cost centers, budgets, P&L |
| [Asset Accounting](requirements/asset-accounting.md) | [/assets.html](https://g54-platform.vercel.app/assets.html) | Fixed assets, depreciation |
| [Content Library](requirements/content-library.md) | [/library.html](https://g54-platform.vercel.app/library.html) | Digital asset management, AI auto-tagging, NLP search |
| [Workflows & Approvals](requirements/workflows.md) | [/workflows.html](https://g54-platform.vercel.app/workflows.html) | Approval chains, automated rules, notifications |
| [Reports](requirements/reports.md) | [/reports.html](https://g54-platform.vercel.app/reports.html) | Business intelligence, dashboards, exports |
| [Administration](requirements/administration.md) | [/admin.html](https://g54-platform.vercel.app/admin.html) | Users, roles, system config, integrations |

### Technical
| Document | Description |
|---|---|
| [Architecture](technical/architecture.md) | System design, hosting, tech stack decisions, deployment |
| [Data Model](technical/data-model.md) | Entities, relationships, key field definitions |
| [Integrations](technical/integrations.md) | SAP Business One migration, Web Store, external APIs |

### Design
| Document | Description |
|---|---|
| [Design System](design/design-system.md) | Component library, color tokens, typography, patterns |

---

## Key Decisions Already Made

| Decision | Choice | Reason |
|---|---|---|
| eCommerce | Native Web Store module | Remove Zoey B2B dependency; no third-party connector |
| Integration middleware | None (removed) | Remove Vision33 Saltbox; direct integrations only |
| Storefront URL | store.g54.com | Replaces greatmountainwest.zoey.com |
| SAP B1 | Migration source | Document flows and master data migrate into MakeReady |
| AI for asset tagging | Claude (Anthropic) API | NLP search and visual auto-tagging in Content Library |
| Web Store order prefix | WEB- | Distinguishes Web Store orders in Sales Order numbering |

---

## Stakeholders

Full contact list and discovery session plan: [stakeholders.md](stakeholders.md)

| Name | Email | Group |
|---|---|---|
| Kim Lund | kim@g54.com | Sales, Finance |
| Chase de Jong | chase@g54.com | Sales (CRM, eComm) |
| Britney de Jong | britney@g54.com | Finance, Operations |
| Leslie Weiler | leslie@g54.com | Sales, Finance, Operations |
| Tyson Johnson | tyson@g54.com | Operations, Art |
| Cody de Jong | cody@g54.com | Sales, Art |
| Jon [TBD] | TBD | Art (Library) |
| Christopher Wall | — | IT / Project Lead, Admin |

---

## Conventions Used in This Package

- **[TBD]** — decision not yet made; requires discovery or client input before build
- **[PHASE 2]** — in scope but not MVP
- Acceptance criteria follow the format: **Given** [context] **When** [action] **Then** [result]
- All wireframe links point to the live prototype at https://g54-platform.vercel.app
