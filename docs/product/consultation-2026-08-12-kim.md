# Consultation — Kim Lund (Sales exec sponsor), 2026-08-12

Runthrough of the current MakeReady build with Kim, executive sponsor for Sales. Below are the decisions and the resulting scope changes. Items are cross-referenced to the requirements docs where they now live.

---

## Decisions & resulting scope

### 1. First-article proof / "press check" (new production stage)
Today Production runs **one** item, photographs it on a **personal cell phone**, and **texts it to Art** to confirm it looks right before running the full order. Moving this in-system.

→ **Scope:** Epic **5.8**; `requirements/jobs-production.md` **US-JOB-07**; Press Check gate added to the job status pipeline; order-level **Press check required** flag (`sales.md` US-SALES-12). Roadmap Phase 4.

### 2. Quote builder simplification
Kim's direction: drop the separate generic **line-item** section. Build orders from a **Garments & Decoration** builder — garment + color + size run, with decoration lines beneath. Catalog-driven dropdowns (no free typing where a catalog value exists), tab-key entry, tablet-friendly. Prints must **auto-validate against garment quantities** (today a manual calculator step).

→ **Scope:** Epic **3.9**; `sales.md` **US-SALES-09**; US-SALES-01 updated.

### 3. Pricing Calculator Engine (retire the spreadsheet)
Replace the "SS Silk Screen Calculator" (currently **version 11**, hand-updated ~twice a year by Alex from a garment-cost tab). Engine handles: quantity price bands, size upcharges (e.g. 2X = +$2), decoration charges by screen-color class **A/B/C** and print location, and **extras** with set costs (barcode **$0.15**, fold **$0.15**, hang tag, UPC, name drop). Auto-apply **vendor freight thresholds** (e.g. free freight at ≥ $250 cost, else ~$1/garment). Add **artist royalties** (per-artist %/amount; source is a hidden spreadsheet Leslie maintains — **TBD**). Admin panel to maintain all tables without a deploy. A rep **quick-reference** price lookup replaces the reps' quick-quote sheets. Embroidery is priced differently (separate model — Epic 3.12).

→ **Scope:** Epics **3.10, 3.12**; `sales.md` **US-SALES-11**.
→ **Input pending:** Kim sending the master **SS Silk Screen Calculator** (via Teams) and the embroidery calculator; royalty-rate source to be found with Leslie.

### 4. Rep pricing discretion — locked down
Reps get a **very short leash**. Default: reps **cannot edit price** — price is engine-set. The old "trade 2–3% commission for a discount" option is **rarely used and will not be built**; Kim leans toward making price editing unavailable to anyone outside whoever sets pricing. Discounts become an Admin/Manager action.

→ **Scope:** recorded in `sales.md` US-SALES-01 and US-SALES-11. Supersedes the earlier "manual override with 10% approval flag" rule.

### 5. OCR business-card capture
Reps still collect/hand out many cards. Add OCR: snap a card on phone/tablet → auto-fill a new **Lead**; card photo attached; rep reviews before save.

→ **Scope:** Epic **2.7**; `crm.md` **US-CRM-07**. Roadmap Phase 7.

### 6. Reorder fast-path
Some customers just say "run my usual again." A reorder with unchanged art **skips customer proof approval and defaults to no press check**, but the customer still gets an in-system copy. Changed art/garment ⇒ treated as new.

→ **Scope:** Epic **3.11**; `sales.md` **US-SALES-10**; jobs US-JOB-07 (press-check default).

### 7. Artwork as source of truth + structured fulfillment fields
Art assigns a design/customer number; a base design can have many name-drops, so the **specific approved file** must be pinned to the order. Warehouse/ship instructions (barcodes, per-size UPCs, G54 hang tags, name drop, folding) become **structured fields** feeding the pricing engine — not a free-text notes blob. Ship date derives from the weekly production/ship calendar Ops publishes each Monday. New vs. reorder route to different internal queues.

→ **Scope:** `sales.md` **US-SALES-12** (barcode/UPC engine and ship-date schedule integration flagged TBD).

### 8. Pipeline stage definitions
Lead = business card / fishbowl drop. Prospect = expressed need / meeting scheduled / credit app sent. Customer = credit approved + customer number assigned (AR assigns number and sales rep). Movement manual for now; triggers exist for later automation.

→ **Scope:** `crm.md` Overview.

### 9. Customer portal — confirmed wanted
Kim confirmed G54 **does** want to give customers a portal (view orders, own libraries). Already delivered per project memory; reaffirmed as desired direction.

---

## Confirmed / reaffirmed (already built or in flight)
- **Everything stays in-system, nothing over email** — credit/terms apps via in-system link (or public website link for new customers), financial docs (credit reports, references) uploaded to the finance vault tied to the BP.
- **Quote/proof approval in-system** — customer view with approve / request-changes and full revision history; content that used to be emailed now lives on the record.
- **Booking link + calendar** — rep can book a first sales meeting on the spot; most G54 meetings are in person. **Pending:** two-way sync with G54 (Outlook) email calendar so reps can block personal/internal time.
- **Order journey / tracker** — internal order-journey view + customer "Amazon-style" tracker.
- **Reorder radar, production readiness checklist gate, art-department board** — shown and liked.
- **Help center** — every feature has an article; Kim to review and annotate in-place.

---

## Follow-ups / TBD
- **Claude Team account (company-owned) + DPA** — move Kim/Brittany off personal Claude accounts onto a **G54-owned Team account** so the DPA prevents Anthropic from training on G54 data, and so access survives staff departures. This same account backs the platform's AI features. Chris to finalize with Brady. Guidance given: keep **PHI and financials** (SSNs, card/account numbers, employee health info) out of AI-assisted email; move sensitive mail to a protected folder before running. (Ops/compliance item — tracked in memory, not a product user story.)
- Pricing inputs: SS Silk Screen Calculator + embroidery calculator (Kim sending); royalty-rate source (Leslie).
- Barcode/UPC generation engine (tie to Design Library barcode book).
- Ship-date schedule integration (Ops weekly calendar).
- Confirm new-vs-reorder internal routing differences with Ops.
- Email/calendar (Outlook) sync for meeting availability.
- Kim to log in, click around, and annotate the help center with wishlist/change notes.
