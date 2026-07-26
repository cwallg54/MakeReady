"""
Generate three MakeReady quote documents for Great Mountain West.
Run: python scripts/generate_quotes.py
Outputs (docs/quotes/):
  1. GMW_Quote1_Market_Benchmark.docx   - fair-market benchmark (comparable Utah firm), full price
  2. GMW_Quote2_Phased_Discounted.docx  - phased breakout with partner discounts, total $110,000
  3. GMW_Quote3_110K_50-50_Terms.docx   - $110,000, terms 50% at start / 50% at completion

Reuses the branded styling helpers from generate_sow.py.
"""

import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from generate_sow import (
    Document, Pt, RGBColor, Inches, WD_ALIGN_PARAGRAPH,
    DARK_NAVY, ACCENT_BLUE, LIGHT_BLUE, MID_GRAY, LIGHT_GRAY, WHITE, BLACK, RED,
    set_cell_bg, set_run_font, add_heading, add_body, add_bullet,
    styled_table, add_divider, add_footer, set_margins, add_page_break,
)

DATE_STR = "July 25, 2026"
OUT_DIR = r"C:\Projects\GMW\docs\quotes"

MONEY = lambda n: "${:,.0f}".format(n)


def money2(n):
    return "${:,.2f}".format(n)


# ---- Shared cover ------------------------------------------------------------

def build_cover(doc, title, subtitle, headline_label, headline_value, meta_extra=None):
    bar = doc.add_table(rows=1, cols=1)
    cell = bar.rows[0].cells[0]
    set_cell_bg(cell, ACCENT_BLUE)
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(10)
    p.paragraph_format.space_after = Pt(10)
    run = p.add_run("MAKEREADY BY G54  —  PRICE QUOTATION")
    set_run_font(run, size=11, bold=True, color=WHITE)
    cell.width = Inches(6.3)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)

    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(20)
    p.paragraph_format.space_after = Pt(4)
    run = p.add_run(title)
    set_run_font(run, size=26, bold=True, color=DARK_NAVY)

    p2 = doc.add_paragraph()
    p2.paragraph_format.space_after = Pt(2)
    run2 = p2.add_run(subtitle)
    set_run_font(run2, size=12.5, color=MID_GRAY, italic=True)

    add_divider(doc)

    fields = [
        ("Client", "Great Mountain West (g54.com)"),
        ("Prepared By", "Christopher Wall"),
        ("Provider Email", "ck.wall@icloud.com"),
        ("Product", "MakeReady — Print MIS / ERP Platform"),
        ("Date", DATE_STR),
        ("Status", "Draft for client review"),
    ]
    if meta_extra:
        fields.extend(meta_extra)
    meta = doc.add_table(rows=len(fields), cols=2)
    meta.style = "Table Grid"
    for i, (label, value) in enumerate(fields):
        row = meta.rows[i]
        bg = LIGHT_GRAY if i % 2 == 0 else WHITE
        set_cell_bg(row.cells[0], bg)
        set_cell_bg(row.cells[1], bg)
        lp = row.cells[0].paragraphs[0]
        lp.paragraph_format.space_before = Pt(5)
        lp.paragraph_format.space_after = Pt(5)
        lr = lp.add_run(label)
        set_run_font(lr, size=10, bold=True, color=DARK_NAVY)
        vp = row.cells[1].paragraphs[0]
        vp.paragraph_format.space_before = Pt(5)
        vp.paragraph_format.space_after = Pt(5)
        vr = vp.add_run(value)
        set_run_font(vr, size=10, color=MID_GRAY)
        row.cells[0].width = Inches(2.0)
        row.cells[1].width = Inches(4.3)

    # Headline price band
    doc.add_paragraph().paragraph_format.space_after = Pt(6)
    band = doc.add_table(rows=1, cols=2)
    band.style = "Table Grid"
    lc, rc = band.rows[0].cells
    set_cell_bg(lc, DARK_NAVY)
    set_cell_bg(rc, DARK_NAVY)
    lp = lc.paragraphs[0]
    lp.paragraph_format.space_before = Pt(8)
    lp.paragraph_format.space_after = Pt(8)
    lr = lp.add_run(headline_label)
    set_run_font(lr, size=12, bold=True, color=WHITE)
    rp = rc.paragraphs[0]
    rp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    rp.paragraph_format.space_before = Pt(6)
    rp.paragraph_format.space_after = Pt(6)
    rr = rp.add_run(headline_value)
    set_run_font(rr, size=20, bold=True, color=WHITE)
    lc.width = Inches(3.8)
    rc.width = Inches(2.5)

    add_page_break(doc)


def closing_block(doc):
    doc.add_paragraph()
    add_divider(doc)
    sig_table = doc.add_table(rows=1, cols=2)
    sig_table.style = "Table Grid"

    def sig_block(cell, party, name, title):
        set_cell_bg(cell, LIGHT_GRAY)
        p = cell.paragraphs[0]
        p.paragraph_format.space_before = Pt(8)
        run = p.add_run(party)
        set_run_font(run, size=11, bold=True, color=DARK_NAVY)
        for label in [f"\n{name}" if name else "\n", title if title else "",
                      "\n\nSignature: ___________________________",
                      "\nPrinted Name: ___________________________",
                      "\nDate: ___________________________"]:
            p2 = cell.add_paragraph(label)
            p2.paragraph_format.space_before = Pt(3)
            p2.paragraph_format.space_after = Pt(3)
            for run in p2.runs:
                set_run_font(run, size=10, color=MID_GRAY)

    sig_block(sig_table.rows[0].cells[0], "Great Mountain West", "", "")
    sig_block(sig_table.rows[0].cells[1], "Christopher Wall", "Christopher Wall", "Principal Developer")
    for cell in sig_table.rows[0].cells:
        cell.width = Inches(3.15)

    doc.add_paragraph()
    add_divider(doc)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(
        "This quotation is confidential and intended solely for the use of Great Mountain West "
        "and Christopher Wall. Unauthorized distribution is prohibited."
    )
    set_run_font(run, size=8.5, italic=True, color=MID_GRAY)


def new_doc():
    doc = Document()
    set_margins(doc)
    add_footer(doc)
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(10.5)
    return doc


# ---- Phase scope summaries (shared) -----------------------------------------

PHASE_SCOPE = {
    "P1": "Platform Foundation + Customer & Sales (bundled): auth, RBAC (6 roles), user mgmt, "
          "system config, role dashboards, audit log, notifications, full platform infrastructure "
          "(single-tenant, design system, CI/CD, encryption, secure SDLC) + security-documentation "
          "deliverable; Business-Partner master, account groups, contacts, activity log, quotes/"
          "estimates, sales orders, delivery, AR invoice, incoming payment (quote-to-cash).",
    "P3": "Web Store (Native B2B): storefront, catalog, account-group pricing, order management, "
          "Web→Sales-Order automation, approval rules, status sync. (Conditional — replaced by a "
          "smaller integration scope if the existing eCommerce platform is retained.)",
    "P4": "Operations: job creation from Sales Order, production queue, status tracking, artwork "
          "attachment, item master, stock, inventory publishing, Quality Management, Equipment Maintenance.",
    "P5": "Finance & Accounting: chart of accounts, AR, AP, bank reconciliation, journal entries, tax, "
          "cost centers, budgets, P&L by segment, fixed assets, depreciation, and complete legacy-ERP "
          "data migration (legacy system decommissioned).",
    "P6": "Content Library (Digital Asset Management): asset upload, LLM-powered auto-tagging & "
          "descriptions, natural-language + visual-similarity search, collections, usage rights/history, "
          "job linking, thumbnails.",
    "P7": "Field Sales RBAC & Mobile: field-sales role dashboards, mobile-responsive order upload, "
          "client artwork upload, sales-manager oversight.",
    "P8": "Workflows, Reports & Intelligence: approval rules engine, sales/production/financial "
          "dashboards, asset reports, CSV/PDF export.",
}

# SOW list fees (program = $200,000) and 0.55 scale to $110,000
SOW_FEES = [
    ("Phase 1", "Platform Foundation + Customer & Sales", 71000),
    ("Phase 3", "Web Store (Native B2B) — conditional", 23000),
    ("Phase 4", "Operations", 23000),
    ("Phase 5", "Finance & Accounting (+ legacy data migration)", 36000),
    ("Phase 6", "Content Library (DAM)", 20000),
    ("Phase 7", "Field Sales RBAC & Mobile", 11000),
    ("Phase 8", "Workflows, Reports & Intelligence", 16000),
]
SCALE = 0.55  # 200,000 -> 110,000


# ============================================================================
# QUOTE 1 - Market Benchmark (comparable Utah firm), full price
# ============================================================================

def build_quote1():
    doc = new_doc()

    # Market benchmark fees (blended agency rate; ~2.9x the funded SOW program)
    rows_market = [
        ("Discovery, Architecture & Design", 15000),
        ("Platform Foundation + Customer & Sales", 205000),
        ("Web Store / eCommerce (B2B)", 66000),
        ("Operations (jobs, production, inventory, QM/PM)", 66000),
        ("Finance & Accounting (+ legacy data migration)", 105000),
        ("Content Library (Digital Asset Management)", 58000),
        ("Field Sales RBAC & Mobile", 32000),
        ("Workflows, Reporting & Intelligence", 46000),
    ]
    total = sum(f for _, f in rows_market)  # 593,000

    build_cover(
        doc,
        "Comparable Market Quotation",
        "Fair-market benchmark — full ERP, CRM & Commerce platform build",
        "Estimated Market Price (full scope)",
        MONEY(total),
    )

    add_heading(doc, "1.  Purpose of This Quotation", 1)
    add_body(doc,
        "This document is a fair-market benchmark: it estimates what a comparable Utah-based custom "
        "software consultancy would charge to design and build the MakeReady platform — a full "
        "SAP Business One / Sage 100 replacement with CRM, Sales, Operations, Finance, Digital Asset "
        "Management, and reporting — at the current, known scope. It is provided so Great Mountain "
        "West can compare the value of the direct engagement (see the companion phased proposal) "
        "against prevailing agency market rates.")

    add_heading(doc, "2.  Pricing Basis", 1)
    for item in [
        "Blended professional-services rate of $150–$200 per hour, typical of established Utah "
        "custom-software and enterprise-application consultancies.",
        "Estimated 3,400–3,900 professional-services hours across discovery, design, engineering, "
        "quality assurance, project management, and DevOps.",
        "Full SAP Business One feature-parity depth, independently estimated at $335,000–$495,000 "
        "in raw build effort, plus standard agency overhead, project management, and margin.",
        "PCI DSS and SOC 2 Type 2 control implementation and evidence, single-tenant architecture.",
    ]:
        add_bullet(doc, item)

    add_heading(doc, "3.  Estimated Market Price by Work Area", 1)
    trows = []
    for name, fee in rows_market:
        trows.append([name, (MONEY(fee), True, DARK_NAVY)])
    trows.append([("Total estimated market price", True, DARK_NAVY), (MONEY(total), True, ACCENT_BLUE)])
    styled_table(doc, headers=["Work Area", "Market Fee"], rows=trows, col_widths=[4.6, 1.7])
    add_body(doc,
        "Representative range for the full scope at market: $520,000–$685,000, depending on the "
        "consultancy's seniority mix, team size, and compliance depth. The single figure above sits at "
        "the mid-point of that range.", color=MID_GRAY, size=9.5)

    add_heading(doc, "4.  What This Comparison Shows", 1)
    add_body(doc,
        "The direct engagement with Christopher Wall delivers the same scope well below prevailing "
        "agency market rates, because it removes the layered overhead, sales margin, and staffing "
        "premium that a consultancy of this size carries. See the companion phased proposal for the "
        "actual funded price and phase-by-phase terms.")

    add_heading(doc, "5.  Notes", 1)
    for item in [
        "This is a market-comparison estimate for planning purposes, not an offer from a third party.",
        "Figures reflect current known scope; discovery may refine them up or down.",
        "Third-party costs (hosting, LLM API usage, payment processing, domain/SSL) are excluded and "
        "billed at cost in any engagement.",
    ]:
        add_bullet(doc, item)

    closing_block(doc)
    out = os.path.join(OUT_DIR, "GMW_Quote1_Market_Benchmark.docx")
    doc.save(out)
    return out, total


# ============================================================================
# QUOTE 2 - Phased proposal with partner discounts, total $110,000
# ============================================================================

def build_quote2():
    doc = new_doc()

    DISCOVERY = 5000
    program = sum(f for _, _, f in SOW_FEES)         # 200,000
    net_after_credit = program - DISCOVERY           # 195,000
    prepay_saving = 2000
    net_with_prepay = net_after_credit - prepay_saving  # 193,000

    build_cover(
        doc,
        "Phased Program Proposal",
        "Funded roadmap of fixed-fee phases — SAP B1 / Sage 100 replacement",
        "Program Total (Phases 1-8)",
        MONEY(program),
        meta_extra=[
            ("Net after Discovery credit", MONEY(net_after_credit)),
            ("With Foundation prepay", f"{MONEY(net_with_prepay)} net"),
        ],
    )

    add_heading(doc, "1.  Engagement Model", 1)
    add_body(doc,
        "MakeReady is delivered as a funded roadmap of fixed-fee phases against a fixed program budget "
        f"of {MONEY(program)} (Phases 1-8). Each phase produces working, deployable software and is "
        "independently useful; Great Mountain West funds one phase at a time, and the per-phase fees "
        f"below sum to the {MONEY(program)} cap. Each phase fee is a fixed allocation of that budget, "
        "confirmed against the phase's requirements at kickoff.")
    add_body(doc,
        "Note on depth: the full 8-phase scope at SAP Business One parity is independently estimated at "
        "$335,000-$495,000 to build to depth, and materially more at agency market rates (see the "
        f"companion market benchmark). Delivering it within the {MONEY(program)} cap prioritizes core "
        "functionality per phase and defers lower-value depth to later change requests.", size=10)

    add_heading(doc, "2.  Phase 0 — Discovery & Design (complete)", 1)
    styled_table(doc,
        headers=["Item", "Detail"],
        rows=[
            [("Fee", True, DARK_NAVY), (MONEY(DISCOVERY) + " flat — due at project start", False, MID_GRAY)],
            ["Deliverables", "Full handoff package: 17 prototype screens, per-module requirements, data model, architecture"],
            [("Credit", True, DARK_NAVY), ("Credited in full against Phase 1 on award of the Foundation build", False, ACCENT_BLUE)],
        ],
        col_widths=[1.6, 4.7])

    add_heading(doc, "3.  Build Phases & Pricing", 1)
    trows = []
    for code, name, fee in SOW_FEES:
        trows.append([(code, True, DARK_NAVY), name, (MONEY(fee), True, ACCENT_BLUE)])
    trows.append([("", False, DARK_NAVY), ("Program Total (Phases 1-8)", True, DARK_NAVY), (MONEY(program), True, ACCENT_BLUE)])
    styled_table(doc,
        headers=["Phase", "Scope", "Fixed Fee"],
        rows=trows,
        col_widths=[0.7, 4.3, 1.3])
    add_body(doc,
        "Phase 1 bundles Platform Foundation ($50,000) and Customer & Sales ($21,000). Prepay incentive: "
        "pay the $50,000 Foundation fee in full in advance and the Customer & Sales work is discounted "
        "from $21,000 to $19,000 — a $2,000 saving, making the Phase 1 bundle $69,000.", size=9.5)

    add_heading(doc, "4.  Discounts & Net Total", 1)
    styled_table(doc,
        headers=["Line", "Amount"],
        rows=[
            ["Program list total (Phases 1-8)", MONEY(program)],
            ["Less: Discovery fee credited against Phase 1", (f"- {MONEY(DISCOVERY)}", False, RED)],
            [("Net program total", True, DARK_NAVY), (MONEY(net_after_credit), True, ACCENT_BLUE)],
            ["Optional: Foundation prepay incentive", (f"- {MONEY(prepay_saving)}", False, RED)],
            [("Net with Foundation prepay", True, DARK_NAVY), (MONEY(net_with_prepay), True, ACCENT_BLUE)],
        ],
        col_widths=[4.6, 1.7])

    add_heading(doc, "5.  Phase Scope Detail", 1)
    for code, key in [("Phase 1", "P1"), ("Phase 3", "P3"), ("Phase 4", "P4"),
                      ("Phase 5", "P5"), ("Phase 6", "P6"), ("Phase 7", "P7"), ("Phase 8", "P8")]:
        add_heading(doc, code, 3)
        add_body(doc, PHASE_SCOPE[key], size=10)

    add_heading(doc, "6.  Payment Terms", 1)
    for item in [
        "Phase 0 (Discovery): $5,000 due at project start; credited against Phase 1 on award of the Foundation build.",
        "Build phases: 50% at phase kickoff, 50% at phase acceptance. Phase 1's kickoff invoice is reduced by the $5,000 Discovery credit.",
        "Foundation prepay incentive: pay the $50,000 Foundation fee in full in advance and Customer & Sales is discounted from $21,000 to $19,000 (a $2,000 saving).",
        "Phases are funded one at a time; Great Mountain West is not obligated beyond a confirmed phase. The $200,000 program cap is fixed.",
        "Phase 3 (Web Store) is conditional — if the existing eCommerce platform is retained and "
        "integrated instead, this phase is dropped and a smaller integration scope is quoted separately.",
        "Out-of-scope change requests are quoted separately before work begins and fall outside the $200,000 budget.",
        "Third-party costs (hosting, LLM API usage, payment processing, domain/SSL) billed at cost.",
    ]:
        add_bullet(doc, item)

    add_heading(doc, "7.  Basis of Estimate", 1)
    add_body(doc,
        "This is a good-faith forecast estimate based on the current requirements, wireframes, and data "
        "model. Each phase fee firms up at kickoff against that phase's finalized requirements; the "
        "$200,000 figure is a fixed program cap, not a guaranteed total for full SAP B1 parity (estimated "
        "separately at $335,000-$495,000 to build to depth). Material scope changes are documented in "
        "writing and priced before the affected work begins.")

    closing_block(doc)
    out = os.path.join(OUT_DIR, "GMW_Quote2_Phased_Discounted.docx")
    doc.save(out)
    return out, program


# ============================================================================
# QUOTE 3 - $110,000 total, terms 50% at start / 50% at completion
# ============================================================================

def build_quote3():
    doc = new_doc()

    disc_total = round(sum(f * SCALE for _, _, f in SOW_FEES))  # 110,000
    half = disc_total / 2  # 55,000

    build_cover(
        doc,
        "Program Proposal — 50/50 Terms",
        "Full program, single price — half at start, half at completion",
        "Program Total",
        MONEY(disc_total),
        meta_extra=[("Payment Terms", "50% at project start / 50% at completion")],
    )

    add_heading(doc, "1.  Overview", 1)
    add_body(doc,
        f"This proposal delivers the complete MakeReady program — all phases below — for a single "
        f"fixed price of {MONEY(disc_total)}. Unlike the phase-by-phase funding option, payment here is "
        f"structured as two equal installments: {MONEY(half)} due at the start of the project and "
        f"{MONEY(half)} due upon completion.")

    add_heading(doc, "2.  Program Scope & Price", 1)
    trows = []
    for code, name, fee in SOW_FEES:
        disc = round(fee * SCALE)
        trows.append([(code, True, DARK_NAVY), name, (MONEY(disc), True, ACCENT_BLUE)])
    trows.append([("", False, DARK_NAVY), ("Program Total", True, DARK_NAVY), (MONEY(disc_total), True, ACCENT_BLUE)])
    styled_table(doc,
        headers=["Phase", "Scope", "Fee"],
        rows=trows,
        col_widths=[0.7, 4.3, 1.3])

    add_heading(doc, "3.  Payment Schedule", 1)
    styled_table(doc,
        headers=["Milestone", "Trigger", "Amount"],
        rows=[
            ["Installment 1 — Project Start", "Due upon signed agreement, prior to commencement",
             (money2(half), True, ACCENT_BLUE)],
            ["Installment 2 — Completion", "Due upon completion and acceptance of the program",
             (money2(half), True, ACCENT_BLUE)],
            [("", False, DARK_NAVY), ("Total", True, DARK_NAVY), (money2(disc_total), True, DARK_NAVY)],
        ],
        col_widths=[2.3, 3.2, 1.2])

    add_heading(doc, "4.  Phase Scope Detail", 1)
    for code, key in [("Phase 1", "P1"), ("Phase 3", "P3"), ("Phase 4", "P4"),
                      ("Phase 5", "P5"), ("Phase 6", "P6"), ("Phase 7", "P7"), ("Phase 8", "P8")]:
        add_heading(doc, code, 3)
        add_body(doc, PHASE_SCOPE[key], size=10)

    add_heading(doc, "5.  Terms", 1)
    for item in [
        f"Fixed program price of {MONEY(disc_total)}; {MONEY(half)} at project start and {MONEY(half)} "
        "at completion.",
        "Phase 3 (Web Store) is conditional — if the existing eCommerce platform is retained and "
        "integrated instead, that scope is adjusted by written change order.",
        "Out-of-scope change requests are quoted separately before work begins.",
        "Third-party costs (hosting, LLM API usage, payment processing, domain/SSL) billed at cost.",
        "Late payments subject to a 1.5% monthly finance charge; governing law: State of Utah.",
    ]:
        add_bullet(doc, item)

    closing_block(doc)
    out = os.path.join(OUT_DIR, "GMW_Quote3_110K_50-50_Terms.docx")
    doc.save(out)
    return out, disc_total


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for fn in (build_quote1, build_quote2, build_quote3):
        path, total = fn()
        print(f"Saved: {path}   (total {MONEY(total)})")


if __name__ == "__main__":
    main()
