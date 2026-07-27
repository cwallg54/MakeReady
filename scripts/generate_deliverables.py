"""
Generate client deliverables (branded DOCX) into docs/deliverables/:
  1. MakeReady_Work_Completed_Checklist.docx
  2. MakeReady_User_Stories.docx
Run: python scripts/generate_deliverables.py
Reuses the branded styling helpers from generate_sow.py.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generate_sow import (
    Document, Pt, Inches, WD_ALIGN_PARAGRAPH,
    DARK_NAVY, ACCENT_BLUE, MID_GRAY, LIGHT_GRAY, WHITE,
    set_cell_bg, set_run_font, add_heading, add_body, add_bullet, add_divider, add_footer, set_margins,
)

DATE_STR = "July 27, 2026"
OUT_DIR = r"C:\Projects\GMW\docs\deliverables"


def cover(doc, title, subtitle):
    bar = doc.add_table(rows=1, cols=1)
    c = bar.rows[0].cells[0]; set_cell_bg(c, ACCENT_BLUE)
    p = c.paragraphs[0]; p.paragraph_format.space_before = Pt(10); p.paragraph_format.space_after = Pt(10)
    set_run_font(p.add_run("MAKEREADY BY G54  —  DELIVERY DOCUMENTATION"), size=11, bold=True, color=WHITE)
    c.width = Inches(6.3)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    p = doc.add_paragraph(); p.paragraph_format.space_before = Pt(18); p.paragraph_format.space_after = Pt(4)
    set_run_font(p.add_run(title), size=25, bold=True, color=DARK_NAVY)
    p2 = doc.add_paragraph(); p2.paragraph_format.space_after = Pt(2)
    set_run_font(p2.add_run(subtitle), size=12.5, italic=True, color=MID_GRAY)
    add_divider(doc)
    meta = doc.add_table(rows=3, cols=2); meta.style = "Table Grid"
    for i, (k, v) in enumerate([("Client", "Great Mountain West (g54.com)"), ("Prepared by", "Christopher Wall"), ("Date", DATE_STR)]):
        row = meta.rows[i]; bg = LIGHT_GRAY if i % 2 == 0 else WHITE
        set_cell_bg(row.cells[0], bg); set_cell_bg(row.cells[1], bg)
        lp = row.cells[0].paragraphs[0]; lp.paragraph_format.space_before = Pt(5); lp.paragraph_format.space_after = Pt(5)
        set_run_font(lp.add_run(k), size=10, bold=True, color=DARK_NAVY)
        vp = row.cells[1].paragraphs[0]; vp.paragraph_format.space_before = Pt(5); vp.paragraph_format.space_after = Pt(5)
        set_run_font(vp.add_run(v), size=10, color=MID_GRAY)
        row.cells[0].width = Inches(1.7); row.cells[1].width = Inches(4.6)
    doc.add_paragraph().paragraph_format.space_after = Pt(4)


def check(doc, text, done=True):
    p = doc.add_paragraph(); p.paragraph_format.space_after = Pt(2); p.paragraph_format.left_indent = Inches(0.25)
    box = p.add_run(("☑  " if done else "☐  "))
    set_run_font(box, size=11, color=(ACCENT_BLUE if done else MID_GRAY))
    set_run_font(p.add_run(text), size=10.5, color=MID_GRAY)


def new_doc():
    doc = Document(); set_margins(doc); add_footer(doc)
    st = doc.styles["Normal"]; st.font.name = "Calibri"; st.font.size = Pt(10.5)
    return doc


CHECKLIST = {
    "Platform Foundation": [
        "Cloud-hosted Next.js platform (App Router, TypeScript, Tailwind, Drizzle ORM, Neon Postgres) on Vercel",
        "Single-tenant architecture, America/Denver time display, live at makeready.g54.com",
        "Collapsible sidebar navigation with role-based module visibility and contextual Help",
    ],
    "Access & Identity": [
        "Email/password sign-in with bcrypt hashing and password policy (min 10, upper/lower/number)",
        "Account lockout after 5 failed attempts (15-min auto-clear) with admin alert",
        "Multi-factor authentication: TOTP authenticator, FIDO2/WebAuthn passkeys, single-use recovery codes",
        "Org-wide require-MFA policy ENABLED - every user must enroll a second factor",
        "Rate limiting on sign-in, password-reset, and MFA verification (per IP, and per user for MFA codes)",
        "Single active session per user; forced password reset; self-service forgot-password",
        "Role-based access control (6 roles, module x access matrix); record-level scoping for reps",
        "User management, system configuration, document number series, and an append-only audit log",
    ],
    "CRM": [
        "Business Partner master (accounts, leads, prospects) with contacts, addresses, tags, account groups",
        "Immutable activity log and CRM tasks; finance fields hidden from sales reps",
        "Order history by customer on the account page (per-order stage/value + lifetime totals, sourced live from the database)",
        "List view with search, stage/owner/group/location filters, sortable columns, and pagination",
        "Pipeline board with drag-and-drop between Lead / Prospect / Customer and true per-column counts",
        "New Business Partner form with a two-option Payment terms dropdown (Net 30 / Prepay)",
        "Secure financial intake documents (terms + credit-card application) via token link",
        "Public web-lead capture form",
        "SAP B1 customer migration: 7,109 business partners, 9,909 contacts, 14,146 addresses imported",
    ],
    "Sales - Quoting & Pricing Calculator": [
        "Configurable order-form templates (Template Builder) driving one Quote Builder",
        "Charge rules: flat / per-unit / per-color / per-hour / percent, with new vs reorder conditions",
        "Quantity price-break bands (e.g. caps 72/144/288/432/576) - auto-priced by order quantity",
        "Per-size upcharges (e.g. 2XL +$2, 3XL +$3) and minimum-order-quantity warnings",
        "Catalogue images per item, carried onto the order on conversion",
        "Server-authoritative pricing; quote statuses; typeahead customer picker; email quote; delete drafts",
        "Real seeded pricing from the SharePoint order forms (Caps, Baja, Softgoods, Wood)",
    ],
    "Sales - Orders & Fulfillment": [
        "Convert accepted quote to a trackable order (SO number + public tracking token)",
        "Production spec items and customer artwork/reference attachments captured at quote intake",
        "Order email to customer includes the order PDF plus a preview image of the item",
        "Public, login-free order tracker (Domino's-style) with live stage updates",
        "Void order with required reason",
    ],
    "Art Department & Proofing": [
        "Submit-to-art hand-off from the order (creates an art request, notifies the art team)",
        "Art board with Queue and drag-and-drop Kanban (To do -> In progress -> Proofing -> Revisions -> Approved -> Done)",
        "Assignment, rush flags, due dates; art request detail with spec + all images",
        "Art team can open/download the customer's original files to edit and upload proposed art",
        "Send a proof to the customer; proof appears on the customer's tracking link",
        "Customer approves / requests changes / declines / requests a meeting - signed, timestamped, IP-stamped",
    ],
    "Production": [
        "Send-to-production hand-off from the order; production job auto-created and team notified",
        "Production board with Queue and drag-and-drop Kanban (Queued -> In production -> Quality check -> Ready to ship -> Shipped)",
        "Operator assignment, rush/due; job detail with production spec and artwork",
        "Job status syncs the customer-facing order tracker stage",
    ],
    "Inventory & Bin Management": [
        "Item master (SKU, category, unit, supplier, cost, on-hand, reorder point) with search, low-stock flags, pagination",
        "Stock ledger: receive / consume / count / adjust with full movement history",
        "Warehouses and bins; per-bin stock as the source of truth (on-hand = sum of bins)",
        "Receive/consume/count/adjust at a specific bin, and transfer stock between bins",
        "Warehouses & bins admin; item detail shows stock-by-bin",
        "SAP B1 inventory reverse-engineered and seeded: 6,219 stocked items, 46 categories, 4 warehouses, 91 bins",
    ],
    "Mobile Field-Sales Experience": [
        "Installable PWA (add-to-home-screen): web manifest, app icons, theme color, full-screen standalone mode",
        "Field-sales bottom navigation (Home, Accounts, +New, Quotes, Orders), role-gated, phones/tablets only",
        "Touch-friendly card views for the CRM, quotes, and orders lists (desktop tables unchanged)",
        "Account quick actions: tap-to-call and tap-to-email the primary contact, jump to activity log, start a pre-filled quote",
        "Mobile-optimized quote builder (stacked line-item cards) with the same server-authoritative pricing",
        "Desktop experience unchanged - all mobile UI is gated below the large-screen breakpoint",
    ],
    "Reports & Analytics": [
        "Executive dashboard: headline KPIs, value-labeled charts on dense data, written breakdowns, low-stock table, CSV export",
        "Crystal Reports-style custom report builder over 6 data sources (BPs, quotes, orders, inventory, production jobs, stock movements)",
        "Column picker, safe parameterized filters, group-by with per-group subtotals and grand totals, live preview, saved reports",
        "Export to CSV or formatted PDF (large grouped reports summarized to stay fast); role-gated to Admin / Sales Manager / Finance",
        "Scheduled email delivery (daily / weekly / monthly, CSV or PDF) via the verified g54.com domain, run by a daily scheduler",
        "Seeded recommended reports & KPI scorecards (pipeline, open/won quotes, open orders, production WIP, inventory valuation, receipts)",
    ],
    "Scheduling": [
        "Calendly-style meeting types, per-user availability, and public booking pages (/schedule/[slug])",
        "Team calendar (month grid), meeting detail, reschedule, and CRM-linked bookings",
    ],
    "Sales Automation & Nurturing": [
        "Drip-campaign engine (timed steps: create task / notify owner / email customer) with a daily scheduler",
        "7 lifecycle nurturing campaigns + missed-meeting recovery seeded from the Field Sales Nurturing Playbook",
        "Automation emails resolve the rep's self-serve booking link; personalization-needed emails become rep tasks",
        "Automatic trigger detection auto-enrolls accounts into the four priority campaigns",
    ],
    "Help & Enablement": [
        "In-app Help Center: 35+ how-to articles across Getting Started, Account & Security, CRM, Sales, Art & Production, Inventory, Reports & Analytics, Scheduling, Admin (incl. a mobile field-sales guide)",
        "Embedded screenshots auto-captured from the live app",
        "Sales-rep quoting training guide (order forms -> Quote Builder) and Zoey API setup handout",
    ],
    "Performance": [
        "Database queries routed over HTTP (no per-query websocket handshake) for lower latency app-wide",
        "Paginated CRM and inventory lists; capped, count-backed pipeline board; parallelized dashboard",
        "Trigram + btree search/filter indexes; trimmed large payloads",
    ],
    "Security Hardening": [
        "Strict Content-Security-Policy with per-request nonce; HSTS (preload); anti-framing",
        "nosniff, Referrer-Policy, Permissions-Policy, Cross-Origin-Opener-Policy; x-powered-by removed",
        "Application rate limiting (Postgres-backed fixed window) on sign-in, password-reset, and MFA verification",
        "Vercel WAF rate-limiting rule on the sign-in and password-reset routes (per-IP, deny on exceed)",
        "Nightly AES-256-encrypted database backup stored offsite (GitHub Actions), 30-day retention, integrity-checked",
        "Security posture documented for the SOC 2 / PCI audit trail",
    ],
}

PENDING = [
    "Verify Neon point-in-time-restore retention is at plan maximum (requires interactive Neon login)",
    "Optional: mirror encrypted backups to S3/R2 for retention beyond 30 days; periodic restore drills",
    "Optional: extend WAF rate-limiting to public token routes (/track, /proof, /apply, /schedule)",
]


def build_checklist():
    doc = new_doc()
    cover(doc, "Work Completed - Checklist", "Delivered capabilities across the MakeReady platform")
    add_body(doc, "The items below are built and deployed to production (makeready.g54.com). Pending items the team has agreed to complete are listed at the end.")
    for section, items in CHECKLIST.items():
        add_heading(doc, section, 2)
        for it in items:
            check(doc, it, True)
    add_heading(doc, "Pending / Agreed Next (security follow-ups)", 2)
    for it in PENDING:
        check(doc, it, False)
    doc.add_paragraph(); add_divider(doc)
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_run_font(p.add_run("Confidential - Great Mountain West / Christopher Wall"), size=8.5, italic=True, color=MID_GRAY)
    out = os.path.join(OUT_DIR, "MakeReady_Work_Completed_Checklist.docx"); doc.save(out); return out


# (persona, story, benefit, [acceptance criteria])
STORIES = {
    "Authentication & Security": [
        ("user", "sign in securely with a second factor", "only I can access my account even if my password leaks",
         ["Password sign-in with lockout after repeated failures", "TOTP, passkey, or recovery code at login", "Single active session; sign-in elsewhere ends the old one"]),
        ("administrator", "require MFA org-wide and review an audit log", "I can enforce security and investigate any change",
         ["Require-MFA is enabled: all users must enroll a second factor", "Every write is recorded in an append-only audit log"]),
        ("security reviewer", "the app to send strict browser security headers", "the platform resists XSS, clickjacking, and downgrade attacks",
         ["CSP with per-request nonce restricts scripts to first-party", "HSTS, anti-framing, and related headers on every response"]),
        ("administrator", "brute-force and flooding to be throttled and data to be recoverable", "the platform resists attacks and I can recover from a disaster",
         ["Rate limiting on sign-in/reset/MFA in the app and a Vercel WAF rule at the edge", "Nightly AES-256 encrypted offsite backups (30-day retention) plus Neon point-in-time restore"]),
    ],
    "CRM": [
        ("sales rep", "find and manage my accounts quickly", "I can act on the right customer without digging",
         ["Search, filter by stage/owner/group/location, sortable + paginated list", "Reps see only their own accounts"]),
        ("sales manager", "drag accounts through the pipeline", "I can move deals forward at a glance",
         ["Drag cards between Lead/Prospect/Customer", "Columns show true totals even when capped"]),
        ("sales rep", "create a Business Partner with standard terms", "new accounts are consistent",
         ["Payment terms is a Net 30 / Prepay dropdown", "A BP number is assigned automatically"]),
        ("account manager", "see a customer's full order history on their account", "I know their stage, value, and lifetime spend at a glance",
         ["Order history card lists each order (number, stage, in-hands, date, value)", "Lifetime order count and total; voided orders excluded; pulled live from the database"]),
    ],
    "Quoting & Pricing": [
        ("sales rep", "build a quote where prices fill in automatically", "I quote fast and correctly, like the old order forms",
         ["Quantity-priced items auto-price by band; unit price is read-only", "Apparel size upcharges applied; below-minimum warning", "Server recomputes all totals on save"]),
        ("administrator", "configure product templates, price bands, and images", "reps always quote from current numbers",
         ["Template Builder edits items, charge rules, bands, sizes", "Catalogue image per item"]),
    ],
    "Orders, Art & Proofing": [
        ("sales rep", "convert a quote to a trackable order and send it", "the customer gets an order confirmation with a preview",
         ["Order gets an SO number and public tracking link", "Email includes the order PDF and an item image"]),
        ("sales rep", "hand an order to the art department", "the artist has the spec and the customer's files",
         ["Submit to art creates a request and notifies the team", "Catalogue and intake images travel with the order"]),
        ("artist", "work art requests on a Kanban board and send proofs", "I manage my queue and get customer sign-off",
         ["Drag jobs across statuses; assign; rush/due", "Download the customer original; upload proposed art; send a proof"]),
        ("customer", "review the proof on my tracking link", "I approve or ask for changes without another login",
         ["Proposed image shown on the tracker", "Approve / request changes / decline / request a meeting, signed + timestamped"]),
    ],
    "Production": [
        ("sales rep", "send an approved order to production", "the shop floor picks it up automatically",
         ["Production job created; team notified; order enters production stage"]),
        ("production operator", "track jobs on a Kanban board", "I see what to make and its status",
         ["Drag jobs Queued -> ... -> Shipped; assignment; job detail with spec + art", "Status advances the customer tracker"]),
    ],
    "Inventory & Bins": [
        ("warehouse manager", "see item stock levels and get low-stock alerts", "I know what to reorder",
         ["Item master with search, low-stock flags, pagination", "Reorder point per item"]),
        ("warehouse manager", "receive, consume, count, adjust, and transfer stock by bin", "on-hand is accurate per shelf",
         ["Per-bin stock is the source of truth; on-hand = sum of bins", "Transfer between bins; full movement history"]),
        ("administrator", "manage warehouses and bins", "the layout matches the real warehouse",
         ["Create warehouses/bins; items show stock-by-bin"]),
    ],
    "Reports & Analytics": [
        ("executive", "an at-a-glance dashboard of the business", "I can see pipeline, sales, and inventory health without digging",
         ["Headline KPIs plus value-labeled charts on real data", "Written breakdowns with CSV export"]),
        ("sales manager", "build, save, and export my own reports", "I get exactly the view I need, like Crystal Reports",
         ["Pick a source, columns, safe filters, group-by with subtotals and grand total", "Export to CSV or formatted PDF; live preview; role-gated"]),
        ("finance user", "have key reports emailed on a schedule", "the numbers arrive without anyone remembering to run them",
         ["Daily/weekly/monthly delivery of CSV or PDF to a recipient list", "Seeded KPI reports and scorecards ready to run or schedule"]),
    ],
    "Mobile Field Sales": [
        ("field sales rep", "run the CRM and orders from my phone", "I can work accounts and quote from the field",
         ["Installable app with a bottom nav (Home, Accounts, +New, Quotes, Orders)", "Card lists, tap-to-call/email, and a mobile quote builder; desktop unchanged"]),
    ],
    "Scheduling & Nurturing": [
        ("sales rep", "share a booking page and run nurturing cadences", "no interested buyer falls through the cracks",
         ["Public booking page; team calendar", "Lifecycle campaigns auto-enroll accounts on trigger; booking links embedded in emails"]),
    ],
    "Enablement & Performance": [
        ("any user", "find how-to help and a fast, responsive app", "I can self-serve and work without waiting",
         ["In-app Help Center with screenshots + training guides", "Pages respond in a tight, snappy band across the app"]),
    ],
}


def build_stories():
    doc = new_doc()
    cover(doc, "User Stories", "Capabilities delivered, expressed as user stories with acceptance criteria")
    add_body(doc, "Each story follows: As a <role>, I want <capability>, so that <benefit> - with acceptance criteria of what was delivered.")
    for area, stories in STORIES.items():
        add_heading(doc, area, 2)
        for role, want, benefit, ac in stories:
            p = doc.add_paragraph(); p.paragraph_format.space_before = Pt(6); p.paragraph_format.space_after = Pt(2)
            set_run_font(p.add_run("As a "), size=10.5, color=MID_GRAY)
            set_run_font(p.add_run(role), size=10.5, bold=True, color=DARK_NAVY)
            set_run_font(p.add_run(", I want "), size=10.5, color=MID_GRAY)
            set_run_font(p.add_run(want), size=10.5, bold=True, color=DARK_NAVY)
            set_run_font(p.add_run(f", so that {benefit}."), size=10.5, color=MID_GRAY)
            for a in ac:
                b = doc.add_paragraph(style="List Bullet"); b.paragraph_format.left_indent = Inches(0.35); b.paragraph_format.space_after = Pt(1)
                set_run_font(b.add_run(a), size=10, color=MID_GRAY)
    doc.add_paragraph(); add_divider(doc)
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_run_font(p.add_run("Confidential - Great Mountain West / Christopher Wall"), size=8.5, italic=True, color=MID_GRAY)
    out = os.path.join(OUT_DIR, "MakeReady_User_Stories.docx"); doc.save(out); return out


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    print("Saved:", build_checklist())
    print("Saved:", build_stories())


if __name__ == "__main__":
    main()
