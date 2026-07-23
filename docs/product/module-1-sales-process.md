# Module 1 — Sales Process (First Deliverable)

**Status:** Scoping · v0.1 · 2026-07-23
**Product:** MakeReady by G54
**Goal:** Ship the first *functional* module — the lead-to-order sales process — as a standalone, low-risk deliverable. If anything in it fails, the fallback is the existing email/phone process, so it can be adopted gradually without risking operations.

---

## 1. Why Sales Process first

From discovery (July 22): the sales/intake process is the natural first module because it is the front of the lead-to-cash lifecycle and has a safe manual fallback. It delivers immediate value (CRM the team has never had, quoting automation, onboarding) while the rest of the business keeps running on the legacy systems until later modules replace them.

---

## 2. Boundary

**In:** Lead capture → CRM → customer onboarding & credit → quoting → order submission → **customer art-approval (e-signature)** → **handoff**.

**Handoff edge:** When an order is credit-approved and art-approved, Module 1 emits a **completed-order package** to the current production/finance systems (export file or API) until those modules exist. Manual fallback (email/phone) remains available throughout rollout.

**Out (later modules):** Production/Jobs execution, Inventory/MRP, Purchasing/Receiving, full Accounting (AR/AP/GL), Content Library (DAM). Payment *capture* is in scope (PCI tokenization); payment *settlement/charge-on-ship* is deferred to the Finance module (token stored for later charge).

```
Intake → CRM → Onboarding/Credit → Quote → Order → [Art Approval e-sign] → HANDOFF ▶ legacy production/finance
```

---

## 3. Included capabilities → requirements

| Area | Requirement IDs (see Requirements Portal) |
|---|---|
| Sales Intake (lead capture, marketing source, qualification, deal registration) | US-CRM-12, US-CRM-13, US-PORT-03 |
| CRM (activity timeline, cadence, team calendar, sync, manager override) | US-CRM-10, 11, 14, 15, 16, 17, 18 |
| Onboarding & Credit (Terms/CC apps, PCI capture, Experian, queue, two-stage credit, welcome packet) | US-ONB-01…08 |
| Quoting (builder, supplier catalog + conditional lists, auto-markup, official quote, add-ons) | US-QT-01…06 |
| Order + visibility (quote→order, Pizza Tracker, self-service portal, Process Board) | US-PORT-01, 02, 04, 06 |
| Art approval e-signature (in-scope gate before handoff) | US-PORT-05 |
| Cross-cutting (efficiency/data-entry, RBAC, audit, system-of-record) | US-EFF-01…04, US-CRM-14, US-CRM-15 |

---

## 4. Data model (module scope)

Core entities Module 1 owns (details to be reconciled against the legacy DB schema review):

`lead` · `business_partner` · `contact` · `account_group` · `price_list` · `credit_application` (terms/CC + tax-exempt, references, guarantee) · `payment_method` (tokenized — no PAN) · `item` / `supplier_catalog` · `quote` · `quote_line_item` · `sales_order` · `so_line_item` · `activity` · `cadence` / `cadence_step` · `calendar_event` · `art_proof` / `art_approval` (signer, IP, timestamp, version) · `user` / `role` · `audit_log`.

Dependencies: **legacy DB backup** review will confirm existing BP/item/order structures and migration mapping; the **pricing calculator** will define the real markup/decoration logic feeding `quote_line_item`.

---

## 5. Handoff contract (completed-order package)

On art-approved + credit-approved, emit: business partner + ship-to, order header (WEB-/SO- number, dates, totals), line items (item, qty, decoration, locations, add-ons, unit price), approved art reference + approval certificate, credit terms/limit status, and the tokenized payment method reference. Delivered as export/import file or API to the interim production/finance systems.

---

## 6. Tech stack (decided)

Next.js (React, SSR) + tRPC · PostgreSQL on Neon (US) · Prisma · Vercel · Vercel Blob (art/proofs) · Clerk (auth, RBAC enforced server-side) · Resend (email) · **PCI**: card data via bank/PCI gateway hosted fields + tokenization (no PAN in MakeReady; SAQ A/A-EP) · React-PDF (quotes). Two-way calendar sync: Google + Microsoft/Outlook. Experian + bank gateway integrations.

---

## 7. Screens (mocked in wireframes)

Sales Intake (`intake.html`) · CRM incl. Cadence + Team Calendar (`crm.html`) · Quote Builder + Pizza Tracker (`sales.html`) · Art Approval (`jobs.html`) · Process Board (`workflows.html`). These are the functional targets for the build.

---

## 8. Build backlog (suggested phasing)

1. **Foundation** — repo, Next.js/tRPC, Neon+Prisma schema, Clerk auth, RBAC (manager/rep/independent), audit log, app shell.
2. **CRM + Intake** — leads, contacts/accounts, activity timeline, marketing source, qualification/routing, deal registration.
3. **Onboarding + Credit (PCI)** — digitized apps, gateway tokenization, Experian, queue routing, two-stage credit, welcome packet.
4. **Quoting** — supplier catalog + conditional lists, calculator-driven markup, quote builder, official PDF, quote→order.
5. **Order + visibility** — order lifecycle status (Pizza Tracker), customer/rep portal, Process Board, art-approval e-signature.
6. **Calendar + cadence** — two-way Google/Outlook sync, team calendar, manager override, event-based cadences.
7. **Handoff** — completed-order export/API + reconciliation.

---

## 9. Definition of done (module)

A rep can take a real lead from capture → qualified → onboarded (credit approved, card tokenized) → quoted (accurate calculator-driven pricing) → order submitted → art approved (auditable e-signature) → handed off — entirely in-platform, with team-wide visibility, on real data, with RBAC and audit logging. Fallback to manual is available but not required.

---

## 10. Open dependencies

- **Legacy DB schema review** → confirms BP/item/order structures + migration mapping (see [[gmw-pending-inputs]]).
- **Pricing calculator (Excel)** → defines real markup tiers / decoration / add-on logic for the Quote Builder.
- Bank/gateway selection for PCI card processing (confirm processor with the bank).
- Experian integration credentials.
