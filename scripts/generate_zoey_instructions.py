"""
Generate the Zoey API setup instructions handout (branded DOCX) for the Zoey admin.
Run: python scripts/generate_zoey_instructions.py
Output: docs/integrations/GMW_Zoey_API_Setup_Instructions.docx
Reuses the branded styling helpers from generate_sow.py.
"""

import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from generate_sow import (
    Document, Pt, Inches, WD_ALIGN_PARAGRAPH,
    DARK_NAVY, ACCENT_BLUE, MID_GRAY, LIGHT_GRAY, WHITE,
    set_cell_bg, set_run_font, add_heading, add_body, add_bullet,
    add_divider, add_footer, set_margins,
)

DATE_STR = "July 25, 2026"
OUT = r"C:\Projects\GMW\docs\integrations\GMW_Zoey_API_Setup_Instructions.docx"
CALLBACK = "https://makeready.g54.com/api/integrations/zoey/callback"


def check(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.left_indent = Inches(0.25)
    r = p.add_run("☐  ")  # ballot box
    set_run_font(r, size=11, color=ACCENT_BLUE)
    r2 = p.add_run(text)
    set_run_font(r2, size=10.5, color=MID_GRAY)


def step(doc, n, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run(f"{n}.  ")
    set_run_font(r, size=10.5, bold=True, color=DARK_NAVY)
    r2 = p.add_run(text)
    set_run_font(r2, size=10.5, color=MID_GRAY)


def mono(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.left_indent = Inches(0.35)
    r = p.add_run(text)
    r.font.name = "Consolas"
    r.font.size = Pt(10)
    r.font.color.rgb = ACCENT_BLUE
    r.font.bold = True


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    doc = Document()
    set_margins(doc)
    add_footer(doc)
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(10.5)

    # Header band
    bar = doc.add_table(rows=1, cols=1)
    cell = bar.rows[0].cells[0]
    set_cell_bg(cell, ACCENT_BLUE)
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(10)
    p.paragraph_format.space_after = Pt(10)
    run = p.add_run("MAKEREADY BY G54  —  INTEGRATION SETUP")
    set_run_font(run, size=11, bold=True, color=WHITE)
    cell.width = Inches(6.3)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)

    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(18)
    p.paragraph_format.space_after = Pt(4)
    run = p.add_run("Zoey API Access — Setup Instructions")
    set_run_font(run, size=24, bold=True, color=DARK_NAVY)
    p2 = doc.add_paragraph()
    p2.paragraph_format.space_after = Pt(2)
    run2 = p2.add_run("For the Great Mountain West Zoey store administrator")
    set_run_font(run2, size=12.5, color=MID_GRAY, italic=True)
    add_divider(doc)

    meta = doc.add_table(rows=3, cols=2)
    meta.style = "Table Grid"
    for i, (label, value) in enumerate([
        ("Prepared by", "Christopher Wall  ·  ck.wall@icloud.com"),
        ("For", "Great Mountain West — Zoey store administrator"),
        ("Date", DATE_STR),
    ]):
        row = meta.rows[i]
        bg = LIGHT_GRAY if i % 2 == 0 else WHITE
        set_cell_bg(row.cells[0], bg); set_cell_bg(row.cells[1], bg)
        lp = row.cells[0].paragraphs[0]; lp.paragraph_format.space_before = Pt(5); lp.paragraph_format.space_after = Pt(5)
        set_run_font(lp.add_run(label), size=10, bold=True, color=DARK_NAVY)
        vp = row.cells[1].paragraphs[0]; vp.paragraph_format.space_before = Pt(5); vp.paragraph_format.space_after = Pt(5)
        set_run_font(vp.add_run(value), size=10, color=MID_GRAY)
        row.cells[0].width = Inches(1.8); row.cells[1].width = Inches(4.5)
    doc.add_paragraph().paragraph_format.space_after = Pt(4)

    add_heading(doc, "Why we need this", 1)
    add_body(doc,
        "Great Mountain West is standing up MakeReady, its new operations platform. To keep the Zoey "
        "storefront and MakeReady in sync — customers, products/catalog, orders, and inventory — "
        "MakeReady needs authorized API access to Zoey via a dedicated OAuth 2.0 client. This is a "
        "standard, revocable integration credential; it does not change anything in your store and can be "
        "disabled at any time from the same screen. Setup takes about 5 minutes.")

    add_heading(doc, "Step 1 — Open the API settings", 1)
    step(doc, 1, "Log into the Zoey admin. Use (or create) an admin user that has access to Products, "
                 "Customers, Orders, and Inventory — the API client inherits that user's permissions.")
    step(doc, 2, "Go to  Settings → APIs.")
    step(doc, 3, 'Find "Zoey REST API – oAuth 2" and click  Manage.')

    add_heading(doc, "Step 2 — Create the OAuth 2.0 client", 1)
    step(doc, 1, "Click Create / Add new client (create a new one — don't reuse an existing integration's client).")
    step(doc, 2, "Name:  MakeReady Integration")
    step(doc, 3, "Allowed Grant Types:  check Authorization Code and Refresh Token.")
    step(doc, 4, 'PKCE:  select "Authorization Code without PKCE" (unless you specifically require PKCE).')
    step(doc, 5, "Redirect / Callback URL:  enter exactly the URL below.")
    mono(doc, CALLBACK)
    step(doc, 6, "Save. Zoey will generate a Client ID and Client Secret.")

    add_heading(doc, "Step 3 — Send us these values (securely)", 1)
    for t in [
        "Client ID",
        "Client Secret",
        "Authorization URL (shown on the OAuth client screen)",
        "Token URL (shown on the OAuth client screen)",
        "Store / API base URL — your Zoey storefront domain (e.g. https://store.g54.com or your *.zoeysite.com address)",
        "Which admin user the client is tied to (so we can confirm Product / Customer / Order / Inventory access)",
    ]:
        check(doc, t)

    add_heading(doc, "Step 4 — Helpful extras (if easy to find)", 1)
    for t in [
        "Any API rate limits documented for your plan",
        "Whether webhooks / event notifications are available (vs. we poll on a schedule)",
        "Confirmation the client is enabled / active",
    ]:
        check(doc, t)

    add_heading(doc, "Security note", 1)
    add_body(doc,
        "Please don't send the Client Secret in plain email or chat. Use a password-manager share, a "
        "secure note, or a one-time-secret link (e.g. onetimesecret.com). The secret grants access to "
        "store data and should be treated like a password.")

    doc.add_paragraph()
    add_divider(doc)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_run_font(p.add_run("Questions? Reply to Christopher Wall — ck.wall@icloud.com"), size=9, italic=True, color=MID_GRAY)

    doc.save(OUT)
    print(f"Saved: {OUT}")


if __name__ == "__main__":
    main()
