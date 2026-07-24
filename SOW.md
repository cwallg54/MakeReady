# MakeReady by G54 — Statement of Work & Pricing

**Client:** Great Mountain West (G54.com)
**Provider:** Christopher Wall / G54 (ck.wall@icloud.com)
**Product:** MakeReady — Print MIS / ERP Platform
**Prepared:** 2026-07-24
**Status:** Draft for client review

---

## 1. Engagement Model

MakeReady is delivered as a **funded roadmap of fixed-fee phases** against a **fixed program budget of $200,000** (Phases 1–8). Each phase produces working, deployable software and is independently useful. G54 funds one phase at a time; the per-phase fees below sum to the $200K cap.

Each phase fee is a **fixed allocation of the $200K budget**. At the start of each phase, its fee is confirmed against that phase's requirements in the [handoff docs](docs/README.md) and wireframes.

- **Budget:** $200,000 fixed cap across Phases 1–8 (single-tenant build)
- **Bundle:** Phase 1 combines Foundation + Customer & Sales into one engagement, with a prepay incentive (see phase table)
- **Billing:** Fixed fee per phase, invoiced at phase kickoff and phase acceptance (50/50), unless noted
- **Acceptance:** Each phase ships against the acceptance criteria in [docs/product/roadmap.md](docs/product/roadmap.md)

> **Scope note — fixed-budget tradeoff.** The full 8-phase scope (SAP B1 parity) is estimated at $335K–495K to build to depth. Delivering it within a $200K cap requires prioritizing core functionality per phase and deferring lower-value depth to later change requests. Any scope added beyond each phase's confirmed requirements is quoted separately and is **outside** the $200K budget.

---

## 2. Commercial Phases

### Phase 0 — Discovery & Design ✅
Requirements, wireframes, data model, and this SOW. **Complete.**

| | |
|---|---|
| **Fee** | **$5,000 flat** — due at project start |
| **Deliverables** | Full handoff package (17 prototype screens, per-module requirements, data model, architecture) |
| **Credit** | The $5,000 Discovery fee is **credited in full against Phase 1** on award of the Foundation build (see below). |

### Build Phases (aligned to [Delivery Roadmap](docs/product/roadmap.md))

| Phase | Scope | Fixed Fee |
|---|---|---|
| **1 — Platform Foundation + Customer & Sales** *(bundled; covers roadmap Phases 1–2)* | **Foundation:** auth, RBAC (6 roles), user mgmt, system config, role dashboards, audit log, notifications + all platform infrastructure (single-tenant, design system, CI/CD, encryption, secure SDLC) + security-documentation deliverable. **Customer & Sales:** BP master, account groups, contacts, activity log, quotes/estimates, sales orders, delivery, AR invoice, incoming payment (full quote-to-cash). | **$71K** = Foundation $50K + Sales $21K. **Prepay incentive: pay the $50K Foundation fee in full in advance → Sales discounted to $19K, bundle = $69K.** *(less $5K Discovery credit)* |
| **3 — Web Store (Native B2B)** *(conditional — may not be needed)* | store.g54.com storefront, catalog, account-group pricing, order mgmt, Web→SO automation, approval rules, status sync. **Only required if G54 builds the native Web Store.** If G54 keeps its existing eCommerce platform and integrates MakeReady to it instead, this phase is dropped and replaced by a smaller **integration scope**, priced separately (typically well below a full build). | **$23K** *(or replaced by integration, scoped separately)* |
| **4 — Operations** | Job creation from SO, production queue, status tracking, artwork attachment, item master, stock, inventory publishing, Quality Management, Equipment Maintenance | **$23K** |
| **5 — Finance & Accounting** | Chart of accounts, AR, AP, bank rec, journal entries, tax, cost centers, budgets, P&L by segment, fixed assets, depreciation, **complete SAP B1 data migration** (SAP decommissioned) | **$36K** |
| **6 — Content Library (DAM + AI)** | Asset upload, AI auto-tagging & descriptions (Claude API), natural-language + visual-similarity search, collections, usage rights/history, job linking, thumbnails | **$20K** |
| **7 — Field Sales RBAC & Mobile** | Field-sales role dashboards, mobile-responsive order upload, client artwork upload, sales-manager oversight | **$11K** |
| **8 — Workflows, Reports & Intelligence** | Approval rules engine, sales/production/financial dashboards, asset reports, CSV/PDF export | **$16K** |

**Program total (Phases 1–8):** **$200,000** fixed cap — **$195,000 net** after the $5K Discovery credit, funded phase-by-phase.
- With the **Foundation prepay** discount: **$198,000** ($193,000 net).
- If **Phase 3 is dropped** in favor of integrating the existing eCommerce platform: subtract $23,000 and add the separately-scoped integration fee.

### Phase 9+ — Future (not yet priced)
Multi-entity & intercompany, EDI, customer self-service portal, native mobile app, custom report builder, drag-and-drop workflow designer, job costing, customer proof-approval portal, purchase orders & goods receipts. Priced when prioritized.

---

## 3. Compliance Boundary — Build to Be Auditable

MakeReady is engineered so that G54 can **pass** PCI DSS and SOC 2 Type 2 audits. Provider builds and documents the controls; **G54 owns the audit.**

**In scope (Provider builds):**
- Encryption in transit and at rest
- Role-based access control and least-privilege enforcement
- Audit logging of security-relevant events
- Secure SDLC practices (code review, dependency scanning, secrets management)
- **Security-documentation deliverable** (Phase 1): data-flow diagrams, control matrix, secure-SDLC writeup — the evidence artifacts an auditor requests
- PCI: card data handled via a compliant payment processor (tokenization); MakeReady stays out of cardholder-data storage scope where feasible

**Out of scope (G54 owns):**
- The SOC 2 / PCI audit engagement itself and the auditor relationship
- The formal attestation / Report on Controls and any resulting opinion
- Organizational/administrative controls outside the software (HR, physical security, vendor management policies)

Provider carries **no compliance or audit liability**; deliverable is auditable software plus evidence artifacts, not an attestation.

---

## 4. Resale / Productization

G54 intends to sell MakeReady to other commercial-print businesses. Building for multi-tenant resale is more expensive than a single-client build (tenant isolation, per-tenant config, white-labeling). Two options:

1. **Single-tenant now, productize later** — build for G54 first; price a separate productization phase when resale is greenlit. *(Lowest near-term cost.)*
2. **Multi-tenant from the start** — adds ~15–25% to Foundation and each module, in exchange for a **licensing/royalty stake** for Provider on third-party sales.

*The $200K budget above assumes **Option 1 (single-tenant)**. Option 2 (multi-tenant from the start) adds ~15–25% and would exceed the $200K cap; it is priced separately with an offsetting royalty arrangement. Decide before Phase 1, as it shapes the Foundation architecture.*

---

## 5. Payment Terms

- **Phase 0 (Discovery):** $5,000 due at project start; **credited against Phase 1** on award of the Foundation build
- **Build phases:** 50% at phase kickoff, 50% at phase acceptance. Phase 1's kickoff invoice is reduced by the $5,000 Discovery credit.
- **Foundation prepay incentive:** if the $50K Foundation fee is paid in full in advance (rather than 50/50), the bundled Customer & Sales work is discounted from $21K to $19K — a $2K saving on the Phase 1 bundle.
- **Phase 3 is conditional:** if G54 retains its existing eCommerce platform and integrates to it, Phase 3 is not billed; a separate integration scope is quoted instead.
- Each phase fee is confirmed against that phase's requirements at kickoff; the $200K program cap is fixed
- Out-of-scope change requests quoted separately before work begins and fall **outside** the $200K budget
- Third-party costs (hosting, Claude API usage, payment processor fees, domain/SSL) billed at cost or paid directly by G54

---

*This SOW aligns to the delivery roadmap and requirements in [`docs/`](docs/README.md). All figures are planning estimates pending phase-level confirmation.*
