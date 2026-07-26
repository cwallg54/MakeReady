"""
Generate the sales-rep quoting training guide (branded DOCX).
Run: python scripts/generate_training_guide.py
Output: docs/training/GMW_Rep_Quoting_Guide.docx
Reuses the branded styling helpers from generate_sow.py.
"""

import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from generate_sow import (
    Document, Pt, Inches, WD_ALIGN_PARAGRAPH,
    DARK_NAVY, ACCENT_BLUE, MID_GRAY, LIGHT_GRAY, WHITE,
    set_cell_bg, set_run_font, add_heading, add_body, add_bullet,
    styled_table, add_divider, add_footer, set_margins,
)

DATE_STR = "July 25, 2026"
OUT = r"C:\Projects\GMW\docs\training\GMW_Rep_Quoting_Guide.docx"


def numbered(doc, n, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(3)
    r = p.add_run(f"{n}.  ")
    set_run_font(r, size=10.5, bold=True, color=DARK_NAVY)
    set_run_font(p.add_run(text), size=10.5, color=MID_GRAY)


def callout(doc, text, color):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(8)
    p.paragraph_format.left_indent = Inches(0.15)
    set_run_font(p.add_run(text), size=10, italic=True, color=color)


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    doc = Document()
    set_margins(doc)
    add_footer(doc)
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(10.5)

    bar = doc.add_table(rows=1, cols=1)
    cell = bar.rows[0].cells[0]
    set_cell_bg(cell, ACCENT_BLUE)
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(10); p.paragraph_format.space_after = Pt(10)
    set_run_font(p.add_run("MAKEREADY BY G54  —  SALES REP TRAINING"), size=11, bold=True, color=WHITE)
    cell.width = Inches(6.3)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)

    p = doc.add_paragraph(); p.paragraph_format.space_before = Pt(18); p.paragraph_format.space_after = Pt(4)
    set_run_font(p.add_run("Quoting in MakeReady"), size=25, bold=True, color=DARK_NAVY)
    p2 = doc.add_paragraph(); p2.paragraph_format.space_after = Pt(2)
    set_run_font(p2.add_run("Moving off the Excel order forms (Caps, Baja, Softgoods, Wood) to the Quote Builder"),
                 size=12, color=MID_GRAY, italic=True)
    add_divider(doc)

    add_heading(doc, "The big picture", 1)
    add_body(doc,
        'For years, quoting meant opening the right Excel "Master" order form for the product, typing into '
        'the white cells, and letting the grey "Formulas – Do Not Type" cells fill in the unit price. Every '
        "product had its own file, and price lists lived in tabs like CAP PRICING.")
    add_body(doc,
        "MakeReady replaces all of those spreadsheets with one Quote Builder. The same formulas now run "
        "inside the app: you pick the product and quantity, and the price fills itself in — no separate file "
        "per product, no chasing the current price list.")

    add_heading(doc, "What changed at a glance", 1)
    styled_table(doc,
        headers=["On the Excel order forms", "In MakeReady"],
        rows=[
            ["A different file per product (Caps, Baja, Softgoods, Wood)", "One Quote Builder; pick a template"],
            ['Grey "Do Not Type" cells calculated the unit price', "Unit price auto-fills from the quantity band"],
            ["CAP PRICING tab (style × quantity)", "Quantity bands on the item (72/144/288/432/576)"],
            ["2XL +$2, 3XL +$3 size cells", "Size dropdown adds the upcharge automatically"],
            ["Screen prep / art / rush cells; New vs Reorder", "Charges & setup checkboxes + a Reorder toggle"],
            ['"Min 144" notes', "Below-minimum warning on the line"],
            ["Email a spreadsheet, re-key into an order", "One-click email, then convert to an order"],
        ],
        col_widths=[3.15, 3.15])

    add_heading(doc, "Caps — quantity bands (the CAP PRICING tab)", 1)
    add_body(doc,
        "On the caps form, the unit price came from the CAP PRICING tab based on style (RC, REN, VEL, Animal) "
        "and quantity band. In MakeReady:")
    numbered(doc, 1, "Add a line and pick the cap.")
    numbered(doc, 2, "Type the quantity.")
    numbered(doc, 3, "The unit price fills in from the band and updates as the quantity changes — e.g. RC: "
                     "72 -> $10.50, 144 -> $9.25, 288 -> $8.25, 432 -> $8.00, 576 -> $7.75.")
    add_body(doc,
        'You\'ll see "auto-priced by quantity band" under the line. If you\'re under the style\'s minimum '
        '(e.g. Animal caps\' 144), you\'ll get a "below minimum" note.')
    callout(doc,
        'The unit price for band items is read-only — locked to the band, just like the grey cells you '
        'weren\'t supposed to type in. For a genuine one-off, choose "custom" on the line and type your own price.',
        ACCENT_BLUE)

    add_heading(doc, "Apparel — size upcharges (Baja & Softgoods)", 1)
    add_body(doc,
        "Pick the Size from the dropdown on the line and the upcharge is added on top of the base price "
        "(e.g. 2XL +$2, 3XL +$3) — the same as the size cells on the Baja form.")

    add_heading(doc, "Decoration, screens, art & rush (Softgoods)", 1)
    add_body(doc, 'The screen/art/rush charges are the "Charges & setup" checkboxes:')
    for t in [
        "New ASI Screen Prep — $15/color",
        "Reorder Screen Prep — $7.50/color",
        "Mid-run color change — $15/color",
        "Art / rework — $65/hour",
        "Rush — +10% (2 weeks) or +20% (1 week)",
    ]:
        add_bullet(doc, t)
    add_body(doc,
        'Tick the ones that apply; per-color and per-hour charges ask for the count. Tick "Reorder" on a '
        "repeat job and the new-only screen prep drops off automatically — exactly like choosing New vs "
        "Reorder on the paper form.")

    add_heading(doc, "Step-by-step", 1)
    numbered(doc, 1, "Sales -> Quotes -> \"New quote.\"")
    numbered(doc, 2, "Pick the customer and the product template (Caps (OSH), Baja Hoodies, Softgoods, Wood "
                     "Products), then open the builder.")
    numbered(doc, 3, "Add a line, pick the item, enter the quantity (and Size for apparel) — the unit price "
                     "fills in automatically.")
    numbered(doc, 4, 'Tick any Charges & setup; set "Reorder" if it\'s a repeat.')
    numbered(doc, 5, "Add notes/discount if needed and Save.")
    numbered(doc, 6, "Email to customer in one click, or convert to an order when accepted.")

    add_heading(doc, "After the quote: order, art & proofing", 1)
    add_body(doc, "Once the quote is accepted and converted to an order:")
    numbered(doc, 1, 'Submit to art. On the order, click "Submit to art." The catalogue image the customer '
                     "picked and the production spec go to the art department, and the order moves to the "
                     "Art & Proof stage.")
    numbered(doc, 2, "Art does the work. The art team picks it up on the Art board (Queue or Kanban), uploads "
                     "the proposed artwork, and sends a proof.")
    numbered(doc, 3, "The customer approves on their tracking link. The proposed image shows up on the same "
                     "tracking link the customer already uses to follow their order. They can Approve, Request "
                     "changes (with notes), Decline, or Request a meeting (which offers your booking link).")
    numbered(doc, 4, "You're notified of their decision, and it's logged to the customer's history. If they "
                     "request changes, art revises and sends a new proof.")
    add_body(doc, "You don't manage the art tools yourself — just submit to art and watch the order advance. "
                  "For the catalogue image to travel with the order, make sure the item has an image (your "
                  "admin sets these in the Template Builder).")

    add_heading(doc, "FAQ", 1)
    for q, a in [
        ("Do I still keep my own spreadsheet?", "No. Prices are managed centrally by your admin in the "
         "Template Builder, so everyone quotes from the same, current numbers."),
        ("A band price is wrong / needs to change.", "Tell your admin — they update it once in the Template "
         "Builder and every rep's quotes use the new number immediately."),
        ("A product isn't in the list.", "Ask your admin to add the template/item, or use a custom line for a one-off."),
        ("Can I still discount?", "Yes — set a discount on the quote; the total recalculates."),
    ]:
        p = doc.add_paragraph(); p.paragraph_format.space_after = Pt(2)
        set_run_font(p.add_run(q + "  "), size=10.5, bold=True, color=DARK_NAVY)
        set_run_font(p.add_run(a), size=10.5, color=MID_GRAY)

    doc.add_paragraph(); add_divider(doc)
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_run_font(p.add_run('Questions: Christopher Wall · ck.wall@icloud.com   |   In-app: Help -> Sales -> '
                           '"For reps: the order-form calculators, now in MakeReady."'),
                 size=9, italic=True, color=MID_GRAY)

    doc.save(OUT)
    print(f"Saved: {OUT}")


if __name__ == "__main__":
    main()
