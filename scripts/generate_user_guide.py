"""
Generate the MakeReady user guide — start to finish, every screen it names
pictured, in Markdown and branded DOCX from one source so the two cannot drift.

Screenshots come from platform/scripts/capture-guide-screenshots.ts. Re-run that
first and every picture in here is current.

Run: python scripts/generate_user_guide.py
Out: docs/training/MakeReady_User_Guide.md
     docs/training/MakeReady_User_Guide.docx
"""

import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from generate_sow import (  # noqa: E402
    Document, Pt, Inches, RGBColor, WD_ALIGN_PARAGRAPH,
    DARK_NAVY, ACCENT_BLUE, MID_GRAY, LIGHT_GRAY, WHITE,
    set_cell_bg, set_run_font, add_divider, add_footer, set_margins, add_page_break,
)

ROOT = r"C:\Projects\GMW"
SHOTS = os.path.join(ROOT, "platform", "public", "help", "guide")
OUT_MD = os.path.join(ROOT, "docs", "training", "MakeReady_User_Guide.md")
# The Word edition is downloadable from inside the app, so it is served
# from public/ rather than kept on somebody's machine.
OUT_DOCX = os.path.join(ROOT, "platform", "public", "help", "MakeReady_User_Guide.docx")
DATE_STR = "September 14, 2026"
# Image path from docs/training/ to where the app keeps the screenshots.
MD_IMG = "../../platform/public/help/guide"
MAX_W, MAX_H = 6.0, 7.6  # inches of usable page

# ---------------------------------------------------------------------------
# Content. Every block is (kind, payload).
#   h1/h2/h3  heading
#   p         paragraph
#   b         bullet
#   n         numbered step
#   shot      (slug, caption)
#   table     (headers, rows)
#   note      call-out line
#   break     page break
# ---------------------------------------------------------------------------
C = []
h1 = lambda t: C.append(("h1", t))
h2 = lambda t: C.append(("h2", t))
h3 = lambda t: C.append(("h3", t))
p = lambda t: C.append(("p", t))
b = lambda t: C.append(("b", t))
n = lambda t: C.append(("n", t))
shot = lambda s, cap: C.append(("shot", (s, cap)))
table = lambda hdr, rows: C.append(("table", (hdr, rows)))
note = lambda t: C.append(("note", t))
brk = lambda: C.append(("break", None))
# Marks where a Help Center article starts. The guide reads as one document;
# in the app it is browsable article by article, cut at these points.
art = lambda slug, title, summary, who="Everyone": C.append(("art", (slug, title, summary, who)))


# ===========================================================================
art("guide-overview", "How the job runs, and how to find your way around",
    "What this guide covers, how to sign in, and how the navigation, search and dashboard fit together.", "Everyone")
h1("What this guide is")
p("MakeReady is where the whole business now runs: the enquiry, the quote, the order, "
  "the art, the press, the invoice, the money in, the money out, and the books. This guide "
  "walks that whole path in the order the work actually happens, and for every step it says "
  "which screen you do it on.")
p("Read Part 1 for the shape of the job on one page. Part 2 is the step-by-step, with a "
  "picture of each screen as it looks today. Part 3 is the daily, weekly and monthly rhythm. "
  "Part 4 covers admin and permissions.")
note("Every screenshot in this guide is generated from the live application. When a screen "
     "changes, the pictures are re-captured rather than redrawn, so what you see here is what "
     "you will see when you sign in.")

h2("Getting in")
p("Sign in at the MakeReady address with your work email and password. If your account is new, "
  "you will have been sent an invitation link to set your own password — nobody, including an "
  "administrator, can see it.")
shot("01-login", "The sign-in screen.")
p("Second-factor security lives under your own account, at Account → Security. You can register "
  "an authenticator app, a passkey or security key, and print recovery codes for the day your "
  "phone is flat.")
shot("e7-security", "Account → Security: authenticator app, passkeys, recovery codes.")

h2("Finding your way around")
b("**The left-hand menu** is the whole platform. One section opens at a time — opening Accounting "
  "closes CRM — so the list stays short enough to read.")
b("**The search box at the top** searches everything at once: customers, contacts, invoices, bills, "
  "vendors, stock items and designs. Type a company name, an invoice number or a SKU.")
b("**The dashboard** is the landing page: open quotes, open orders, jobs on the floor, low stock, "
  "your pipeline and your own open tasks, with shortcuts to the things you start most often.")
shot("02-dashboard", "The dashboard — what is open right now, and the quick actions.")
shot("03-search", "Search finds customers, contacts, invoices, bills, vendors, stock and designs together.")
b("**Notifications** collects what the platform needs to tell you — a proof approved, an approval waiting, a job that has moved.")
shot("04-notifications", "Notifications.")

brk()
# ===========================================================================
art("guide-the-job-on-one-page", "The job on one page",
    "The whole path from a phone call to a closed month, and the screen each stage happens on.", "Everyone")
h1("Part 1 — The job on one page")
p("This is the whole path from a phone call to money in the bank and a closed month. "
  "Each row is a stage; the right-hand column is where you do it.")
table(
    ["#", "What happens", "Where in MakeReady"],
    [
        ["1", "An enquiry arrives; you record who it is", "CRM → Business Partners / Pipeline"],
        ["2", "Set the account up: terms, credit, contract pricing", "CRM → the customer → Account details, Contract pricing"],
        ["3", "Price it and send the quote", "Sales → Quotes → New quote → Quote Builder"],
        ["4", "They say yes; the quote becomes an order", "Sales → Quotes → Convert; then Sales → Orders"],
        ["5", "Art is briefed, drawn, proofed and approved", "Art Department → the request"],
        ["6", "Blanks are bought and received", "Inventory → Purchase Orders; Accounting → GRNI"],
        ["7", "The job is scheduled, printed and checked", "Production → Schedule; Quality"],
        ["8", "It ships and you invoice it", "The order → Create invoice; Accounting → Invoices"],
        ["9", "The money comes in and is banked", "Accounting → Payments → Deposits"],
        ["10", "Slow payers are chased", "Accounting → Collections, Aging, Statements"],
        ["11", "Suppliers, staff and expenses are paid", "Accounting → Bills, Payment Runs, Expenses, Payroll"],
        ["12", "The month is closed and reported", "Accounting → Periods, Close, Financial Statements"],
        ["13", "You check how the business is doing", "Accounting → Flash, Quarterly; Controlling; Reports"],
    ],
)
note("Every order carries an **Order journey** strip showing exactly which of these stages it has "
     "reached. If you only ever learn one thing about an order, learn to read that strip.")

brk()
# ===========================================================================
art("guide-take-in-the-enquiry", "Step 1 — Take in the enquiry",
    "Recording a new lead, working the pipeline, and scanning a business card instead of typing it.", "Sales")
h1("Part 2 — Step by step")

# ---- 1 --------------------------------------------------------------------
h2("1. Take in the enquiry")
p("Everyone you deal with — lead, prospect or customer — is a Business Partner. CRM lists them "
  "all, filtered by stage, by owner, or down to just your own accounts.")
shot("10-crm-list", "CRM → Business Partners. Filter by stage or to My accounts.")
p("The Pipeline is the same information as a board, so you can see what is moving.")
shot("11-crm-pipeline", "Pipeline — leads, prospects and customers as columns.")
h3("Adding someone new")
n("CRM → **New Business Partner**.")
n("Fill in the account, the primary contact, the address and the terms.")
n("Save. They start as a **Lead**; promote them to Prospect and then Customer as the relationship moves.")
p("If you are holding their business card, press **Scan** instead of typing: photograph the card "
  "and the details are read off it and filled in for you to check.")
shot("12-crm-new", "New Business Partner — or scan a business card and let it fill itself in.")

# ---- 2 --------------------------------------------------------------------
art("guide-set-up-the-account", "Step 2 — Set the account up properly",
    "The customer record, logging contact, contract pricing, and spotting accounts due to reorder.", "Sales")
h2("2. Set the account up properly")
p("The customer page is the single place everything about an account lives: details, contacts, "
  "addresses, order history, open financial documents, tasks and the full activity log.")
shot("13-customer", "A customer record — details, contacts, history, financials and activity in one place.")
b("**Log a call, an email or a visit** with the buttons at the top — that is what feeds the rep "
  "activity report, so it is worth doing.")
b("**AI summary** reads the account's history and tells you where things stand before you ring them.")
b("**Draft email** writes a first draft you then edit; it is never sent without you sending it.")
b("**Invite to portal** gives the customer their own login to see orders, proofs and invoices.")
b("**New Quote** starts a quote with this customer already selected.")
h3("Contract pricing")
p("Where a customer has negotiated pricing — a percentage off, or a fixed price per unit — record "
  "it once here and the quote builder applies it automatically for everyone who quotes them.")
shot("14-customer-pricing", "Contract pricing — agreed discounts applied automatically at quoting time.")
h3("Customers who are due to come back")
p("Reorder radar lists accounts whose usual reorder interval has passed. It will draft the "
  "outreach for you and start the quote.")
shot("15-reorders", "Reorder radar — who is overdue to reorder, with the outreach half-written.")

# ---- 3 --------------------------------------------------------------------
art("guide-quote-it", "Step 3 — Quote it",
    "Building a quote in the Quote Builder, and the design and catalog libraries behind it.", "Sales")
h2("3. Quote it")
p("The Quote Builder replaces the Excel order forms. Pick the customer and the product template, "
  "and the pricing runs inside the app.")
shot("20-quote-new", "New quote — choose the customer and the product template, then open the builder.")
n("**Add a line** and pick the item.")
n("Type the **quantity** — the unit price fills in from the quantity band.")
n("Pick the **size** for apparel; the upcharge is added automatically.")
n("Tick the **charges and setup** that apply — screen prep, mid-run colour changes, art time, rush.")
n("Set **Reorder** on a repeat job and the new-only screen prep drops off.")
n("Send it, and watch it in the quote list.")
shot("21-sales-hub", "Sales → Quotes. Every quote, its product, status and value.")
note("Unit prices on band-priced items are deliberately locked — the same reason the grey cells on "
     "the old spreadsheets said 'Formulas – Do Not Type'. For a genuine one-off, set the line to "
     "**custom** and type your own price.")
p("Two libraries sit behind the builder. The **Design Library** holds every customer design with "
  "its item numbers and barcodes; the **Catalog** holds the garment styles, their costs and the "
  "decoration pricing rules.")
shot("22-designs", "Design Library — customer designs, catalog numbers and barcodes.")
shot("23-catalog", "Administration → Catalog & Pricing — the styles and the pricing rules behind every quote.")

# ---- 4 --------------------------------------------------------------------
art("guide-turn-win-into-order", "Step 4 — Turn the win into an order",
    "Converting a quote, and using the order page as the spine of the whole job.", "Sales")
h2("4. Turn the win into an order")
p("An accepted quote converts straight into a sales order — nothing is re-keyed.")
shot("30-orders", "Sales → Orders, each showing the stage it has reached.")
p("The order page is the spine of the job. Everything that happens to it hangs off here.")
shot("31-order", "A sales order — journey, stage, art, production, items, fulfilment and invoicing.")
b("**Order journey** across the top shows how far the job has got.")
b("**Update stage** moves it on: Order Received → Art & Proof → In Production → Quality Check → "
  "Shipped → Delivered.")
b("**Submit to art** raises the art request; **Send to production** puts it on the floor.")
b("**Items & decoration** is the specification the artist and the press both work from.")
b("**Customer tracker link** is a public link you can send so they can follow the job themselves "
  "without ringing you.")
b("**Create invoice** raises the invoice from the order when it ships.")

# ---- 5 --------------------------------------------------------------------
art("guide-art-and-proofing", "Step 5 — Art and proofing",
    "The art queue, the brief, revisions, the readiness checklist, and getting the proof approved.", "Art")
h2("5. Art and proofing")
p("Everything submitted to art lands in the art department queue, as a board or a list.")
shot("40-art-queue", "The art queue.")
p("An art request walks a fixed path, and the buttons enforce it in order.")
shot("41-art-job", "An art request — brief, artist, revisions, readiness checklist and proofing.")
n("**Assign artist.**")
n("**Artwork produced.**")
n("**Out for review.**")
n("**Customer approved** — the proof goes to the customer from this screen, and every proof sent is kept.")
n("**Production ready** — this one only unlocks once the readiness checklist is complete.")
b("**Draft brief with AI** writes the customisation brief from the order specification; the artist edits it.")
b("**Production files & handoff** is where the press-ready files go.")
b("**Revisions** keeps every version, so 'which one did they approve?' always has an answer.")
p("The artist schedule shows who is working on what, and what is unassigned.")
shot("42-art-schedule", "Artist schedule — workload and anything unassigned.")
p("Logos, photographs and brand assets live in the Content Library rather than on somebody's desktop.")
shot("43-content-library", "Content Library — the shared asset store.")

# ---- 6 --------------------------------------------------------------------
art("guide-buy-the-blanks", "Step 6 — Buy the blanks",
    "The item master, the reorder forecast, raising and receiving purchase orders, and GRNI.", "Purchasing")
h2("6. Buy the blanks")
p("The item master holds every stocked item with its on-hand quantity, reorder point and cost "
  "across the warehouses.")
shot("50-inventory", "Inventory — the item master, on hand and reorder points.")
p("The reorder forecast does the thinking: it looks at usage, lead time and what is on hand, and "
  "tells you what to order and how many days you have left.")
shot("53-forecast", "Reorder forecast — what to buy, and how long before you run out.")
n("Inventory → **Purchase Orders** → **New PO**, pick the vendor and the lines.")
n("Receive the goods against the PO when they arrive.")
n("Match the vendor's bill to the receipt.")
shot("51-purchase-orders", "Purchase orders — ordered, expected, received and value.")
p("Anything received but not yet invoiced by the vendor sits in **GRNI**, aged, so nothing is "
  "quietly missing from the accounts at month end.")
shot("54-grni", "Goods received, not invoiced — receipts still waiting on a vendor bill.")

# ---- 7 --------------------------------------------------------------------
art("guide-make-it", "Step 7 — Make it",
    "The production schedule, quality inspections, and equipment work orders.", "Production")
h2("7. Make it")
p("The production schedule is the ship calendar and the board of what is on the floor.")
shot("60-production-schedule", "Production schedule — the ship calendar.")
p("Quality inspections are recorded against the order, with what was inspected, what was rejected "
  "and the result.")
shot("62-quality", "Quality — inspections against orders.")
p("Equipment problems and servicing go on work orders so the press that keeps jamming is a record, "
  "not a rumour.")
shot("63-maintenance", "Maintenance work orders.")

# ---- 8 --------------------------------------------------------------------
art("guide-invoice-it", "Step 8 — Invoice it",
    "Raising the invoice from the order, emailing it, and the customer pay link.", "Finance")
h2("8. Invoice it")
p("Invoices are normally raised from the order with **Create invoice**, so the lines and the "
  "customer come across already correct. Accounting → Invoices → **New invoice** is there for "
  "anything standalone.")
shot("70-invoices", "Invoices, filtered by status — draft, sent, partial, paid, void.")
shot("72-invoice-new", "Accounting → Invoices → New invoice, for anything not raised from an order.")
shot("71-invoice", "An invoice — lines, payments, PDF and email.")
b("**PDF** produces the document; **Email invoice** sends it to the customer.")
b("The emailed invoice carries a **pay link**: the customer can pay by ACH with no fee, or by card "
  "with the surcharge shown, without ringing anyone.")
b("**Record payment** takes a receipt straight against this invoice.")
b("**Void** reverses an invoice raised in error. Invoices are never deleted — the number stays, "
  "marked void, so the sequence has no holes.")

# ---- 9 --------------------------------------------------------------------
art("guide-get-the-money-in", "Step 9 — Get the money in",
    "Receipts, deposits, aging, the collections call list, statements and credit memos.", "Finance")
h2("9. Get the money in")
p("Cash comes in two steps, deliberately: you record the receipt when it arrives, then bank it in "
  "a batch. The bank statement shows the batch, not the individual cheques, which is what makes "
  "the reconciliation work.")
shot("80-payments", "Payments — every receipt, and the on-account box for cash you cannot yet match.")
n("**Record the receipt.** Against one invoice, across several, or on account if you do not yet "
  "know what it pays.")
n("**Bank it.** Accounting → Deposits batches the undeposited receipts into the deposit you "
  "actually take to the bank.")
shot("81-deposits", "Deposits — undeposited receipts, ready to batch.")
h3("Chasing what is late")
p("The aging report is the overall picture: everything owed, by customer, by how late it is.")
shot("82-aging", "AR Aging — current, 1–30, 31–60, 61–90 and 90+.")
p("Collections is the working screen — the call list for the day rather than a report to read.")
shot("83-collections", "Collections — today's call list, cards to run, prepay and COD, and the parent-account rollup.")
b("**Call list — 15 days past due** is who to ring today.")
b("**Cards to run today** and **Cards past due** are the card-on-file accounts.")
b("**Prepay / COD outstanding** is work that should not have shipped without money.")
b("**Open AR by parent account** rolls the chains up, so a group with forty stores is one conversation.")
p("A statement is what you send when they ask 'what do we actually owe?' — every open item and the "
  "aging summary, as a PDF or straight to their inbox.")
shot("84-statement", "A customer statement — open items and aging, ready to email.")
h3("Credits")
p("A return, a shortage or an allowance is a credit memo. It sits open against the account until "
  "it is applied to invoices, exactly like a receipt.")
shot("85-credit-memos", "Credit memos — raised, and what is still unapplied.")
p("Where an order would push a customer over their credit limit or is on hold, it goes to credit "
  "requests for a decision rather than being shipped on hope.")
shot("86-credit-requests", "Credit requests — over-limit and on-hold orders awaiting approval.")

# ---- 10 -------------------------------------------------------------------
art("guide-pay-everyone-else", "Step 10 — Pay everyone else",
    "Vendor bills, payment runs, vendor credits, staff expenses and payroll.", "Finance")
h2("10. Pay everyone else")
p("Vendor bills are entered against the vendor and coded to the GL accounts they belong to.")
shot("90-bills", "Bills — what is owed, what is due, and what is left on each.")
shot("91-bill", "A bill — its lines, the accounts they are coded to, and its payments.")
p("Bills are not paid one at a time. A payment run selects everything due, gets it approved, and "
  "produces one instrument per vendor and one journal entry for the batch.")
shot("92-payment-runs", "A payment run — everything due, netted against vendor credits, one payment per vendor.")
p("Credits from vendors are recorded so they net off the next run instead of being forgotten.")
shot("93-vendor-credits", "Vendor credits.")
h3("Staff expenses")
p("Expense claims are entered as a report, submitted, approved, and then paid like any other bill. "
  "The screen tells you which GL account each category books to, so coding is not guesswork.")
shot("94-expenses", "Expense reports, and what each category books to.")
h3("Payroll")
p("Payroll is posted twice a month from a template, so the same dozen-odd lines are not retyped. "
  "Start a run, check the figures, post it. The accrual run copies the last payroll rather than "
  "the last accrual, so accruals never drift.")
shot("95-payroll", "Payroll journals — runs and the semi-monthly template.")

# ---- 11 -------------------------------------------------------------------
art("guide-close-the-month", "Step 11 — Close the month",
    "Fiscal periods, the close, the ledger, financial statements, bank reconciliation and sales tax.", "Finance")
h2("11. Close the month")
p("The Accounting hub is the index of everything in this part of the business.")
shot("a0-accounting-hub", "The Accounting hub.")
p("The financial year runs **October to September** and is named for the year it ends in — FY2026 "
  "is October 2025 to September 2026. Each period is open, closing or locked.")
shot("a1-periods", "Fiscal periods — status, entry counts and postings for every month of the year.")
table(
    ["Status", "What it means"],
    [
        ["Open", "Anyone with the right to post can post into it."],
        ["Closing", "Only the finance team can post — the month is being finished."],
        ["Locked", "Nothing can post. The month is done."],
    ],
)
p("The close screen walks the month: what is still outstanding, then lock it. A locked period can "
  "be reopened if something genuinely has to change, and that reopening is recorded.")
shot("a2-close", "Period close — what is outstanding, then lock the month.")
h3("The books themselves")
b("**Journal Entries** — every posting, whether it came from an invoice, a payment run, payroll or "
  "somebody's manual adjustment. Accruals reverse themselves automatically the following month.")
b("**Trial Balance** — every account's balance, debits equal to credits.")
b("**Income Statement**, **Balance Sheet** and **Cash Flow** — run for any date range, print or save as PDF.")
shot("a3-journal", "Journal entries — every posting and where it came from.")
shot("a4-trial-balance", "Trial balance.")
shot("a5-income-statement", "Income statement.")
shot("a6-balance-sheet", "Balance sheet.")
shot("a7-cash-flow", "Cash flow statement.")
h3("Bank reconciliation")
p("Import the bank statement, tick off what has cleared, and post anything the bank knows about "
  "that the books do not — charges, interest, fees.")
shot("a8-reconcile", "Bank reconciliation — import the statement and clear the lines.")
h3("Sales tax")
p("The filing report gives you the period's figures by jurisdiction, where tax is being collected, "
  "and which customers hold exemption certificates.")
shot("a9-sales-tax", "Sales tax filing, by jurisdiction, with exemption certificates.")

# ---- 12 -------------------------------------------------------------------
art("guide-see-how-youre-doing", "Step 12 — See how the business is doing",
    "Weekly flash, the quarterly pack, segment P&L, goals, commission and job-level profit.", "Managers")
h2("12. See how the business is doing")
p("**Weekly flash** is the Monday-morning screen: cash position, the week's sales, the biggest "
  "receipts and invoices, and everything sitting waiting on somebody.")
shot("b0-flash", "Weekly flash — the week at a glance, including cash not yet banked and credits not applied.")
p("**Quarterly pack** is the board version: the quarter against last year, year to date, the "
  "quarter by segment, and the cash and receivables behind it.")
shot("b1-quarterly", "Quarterly pack.")
p("**P&L by segment** splits the result by the part of the operation that earned it — heat "
  "transfer, softgoods, embroidery, screen print, the warehouse, and the overhead departments.")
shot("b2-segment-pnl", "P&L by segment.")
p("**Sales goals** sets each rep's monthly target and shows actual against it for the year.")
shot("b3-goals", "Sales goals against actuals, by rep and month.")
p("**Commission** works out what each rep has earned on what has actually been invoiced.")
shot("b4-commission", "Commission report.")
h3("Job-level profit")
p("Controlling asks the harder question: did this job, this customer, this rep actually make money?")
shot("b5-job-costing", "Job costing — revenue, cost and margin per order.")
shot("b6-profitability", "Profitability by customer and by salesperson.")
shot("b7-budget", "Budget against actual, account by account.")

# ---- 13 -------------------------------------------------------------------
art("guide-reports", "Step 13 — Reports",
    "The built-in reports, and building, saving and scheduling your own.", "Everyone")
h2("13. Reports")
p("Reports has two halves: the standard reports that are built in, and custom reports anyone can "
  "build and save.")
shot("c0-reports", "The report catalogue — built-in reports and saved custom reports.")
p("The built-in set covers the reports the business has always run:")
b("**Sales Analysis by Salesperson & Customer** — three years side by side, month by month.")
b("**Open Orders by Salesperson** and **by Type**.")
b("**Customer Credit Report** — the credit picture for an account.")
b("**Revenue Trend**, **Top Products & Designs**, **Sales-Rep Activity**, **Lead-Source ROI**.")
shot("c2-sales-analysis", "Sales Analysis — three years by month, per customer, grouped by rep.")
shot("c3-credit-report", "The Customer Credit Report.")
shot("c4-open-orders", "Open Orders by Salesperson.")
shot("c5-rep-activity", "Sales-Rep Activity — calls, notes, emails, visits, quotes and what they won.")
h3("Building your own")
n("Reports → **Build a report**.")
n("Pick the source and the columns.")
n("**Add filter** for each condition you want.")
n("**Preview**, then **Save report**.")
shot("c1-report-new", "The report builder.")
p("A saved report can be edited, deleted, exported to CSV and scheduled to email itself out.")

# ---- 14 -------------------------------------------------------------------
art("guide-web-store", "Step 14 — The web store",
    "Publishing products, pricing and promotions, and the orders that come in through the storefront.", "Sales")
h2("14. The web store")
p("The web store is our own storefront — it replaces Zoey rather than talking to it. Products are "
  "published from the same inventory the rest of the platform uses, so there is one catalogue, "
  "not two.")
shot("d0-web-store", "Web Store administration — products, retail and B2B pricing, visibility.")
b("**Add from inventory** publishes an existing stocked item to the store.")
b("**Categories**, **Promos** and **Groups** control how it is presented and who sees what price.")
b("**Customers** and **Orders** are the store's own accounts and their orders.")
shot("d1-web-store-orders", "Store orders — pending, confirmed, fulfilled, cancelled.")
shot("d2-storefront", "The storefront as a customer sees it.")

brk()
# ===========================================================================
art("guide-the-rhythm", "The rhythm of the job",
    "What to check every day, every week, twice a month, every month and every quarter.", "Everyone")
h1("Part 3 — The rhythm of the job")
h2("Every day")
b("**Dashboard** — what is open, what is on the floor, what is low on stock.")
b("**Collections → call list** — ring today's 15-days-past-due accounts; run the cards that are due.")
b("**Payments** — record what came in.")
b("**Art queue** and **Production schedule** — anything stuck, anything due to ship.")
b("**Approvals inbox** — decisions waiting on you.")
h2("Every week")
b("**Weekly flash** — the week's cash, sales, receipts and anything waiting on someone.")
b("**Deposits** — bank the receipts; nothing should sit undeposited over a weekend.")
b("**Payment run** — pay the bills that are due, netted against vendor credits.")
b("**Reorder forecast** — order the blanks before the days-left column goes red.")
b("**GRNI** — chase vendor bills for goods already received.")
h2("Twice a month")
b("**Payroll** — start the run from the template, check it, post it.")
h2("Every month")
n("**Bank reconciliation** — import the statement and clear it.")
n("**Sales tax filing** — run the period and file it.")
n("**GRNI and accruals** — make sure costs sit in the month that earned them.")
n("**Trial balance** — check it balances and nothing looks wrong.")
n("**Income statement, balance sheet, cash flow** — run and save them.")
n("**Period close** — work the close screen, then lock the month.")
h2("Every quarter")
b("**Quarterly pack** — the quarter against last year, by segment.")
b("**Sales goals** and **Commission** — how the reps did, and what they earned.")
b("**Profitability and job costing** — which customers and which work are actually worth having.")

brk()
# ===========================================================================
art("guide-running-the-place", "Running the place",
    "User accounts, teams, report permissions, workflows, approvals, settings and the audit trail.", "Administrators")
h1("Part 4 — Running the place")
h2("People and access")
p("Administration → Users is where accounts are created. **Create user & send invite** emails them "
  "a link to set their own password — you never handle it.")
shot("e1-users", "Administration → Users — roles, status, last login.")
b("**Edit** changes someone's roles.")
b("**Force reset** makes them set a new password next time they sign in.")
b("**Activate / deactivate** turns access on and off. Deactivating ends their sessions immediately.")
note("Thirteen of the sales reps carried over from SAP were created **inactive with no password** "
     "(the other three already had accounts). "
     "Check each address is right, then activate and invite them — nothing is sent until you do.")
p("Teams group people for routing — art, product, production, purchasing, sales — so work reaches "
  "the right desk rather than a named individual who might be on holiday.")
shot("e2-teams", "Teams and routing groups.")
h3("Who can see which report")
p("Reports → Access controls visibility. A built-in report can be restricted so only granted roles "
  "or people see it; a saved report is private, shared, or open to everyone, with grants on top.")
shot("c6-report-access", "Report access — restrict a built-in report, or grant view, edit and delete.")
table(
    ["Right", "What it allows"],
    [
        ["View", "Open the report and export it."],
        ["Edit", "Change its columns, filters, sharing and scheduled delivery."],
        ["Delete", "Remove it entirely."],
    ],
)
p("Rights do not cascade upward: a view grant never confers edit, and edit never confers delete.")

h2("Workflows and approvals")
p("One-click workflows do the repetitive sequences — onboarding a new customer, for example — in "
  "one action instead of six screens. Approval rules decide what needs a human yes before it "
  "proceeds; those decisions queue in the approvals inbox.")
shot("e3-workflows", "Workflows — one-click sequences and recent runs.")
shot("e4-approvals", "The approvals inbox.")

h2("Settings and the audit trail")
p("Configuration holds the company details and the document number series — the prefix and next "
  "number for each document type.")
shot("e6-config", "Configuration — company settings and document numbering.")
p("The audit log records who did what, to which record, from which address. It is searchable and "
  "exports to CSV.")
shot("e5-audit", "The audit log.")

brk()
# ===========================================================================
art("guide-what-came-from-sap", "What came across from SAP",
    "The history and open balances migrated from SAP, and why old document numbers still work.", "Everyone")
h1("Appendix — What came across from SAP")
p("MakeReady was not started empty. The SAP history was migrated, so the reports have real "
  "history behind them from the first day:")
table(
    ["What", "How much"],
    [
        ["Customers and vendors", "7,100+ business partners, 833 vendors"],
        ["Order history", "262,000 historical orders"],
        ["Stocked items", "6,219 items across four warehouses"],
        ["General ledger", "Full posted history; ties to SAP within a penny"],
        ["Open receivables", "1,978 invoices, $2,050,117.68"],
        ["Open credits", "97 credit memos, $17,044.11"],
        ["Open payables", "1,095 bills, $703,428.68"],
        ["Payment terms", "56 terms, mapped to the customers that use them"],
        ["Sales reps", "16 reps, linked to their user accounts"],
    ],
)
p("Invoices carried over keep their SAP number with an **SI-** prefix, credit memos **SC-**, and "
  "vendor bills **SAP-**, so a customer or supplier quoting an old document number can still be "
  "found. Their balances were carried without re-posting to the ledger, because the ledger already "
  "holds that history — which is why the accounts tie exactly rather than double-counting.")

h2("Getting help")
p("The **Help** section in the left-hand menu holds the how-to articles. Anything that looks wrong "
  "in the data — rather than in the way a screen works — is worth raising with an administrator, "
  "who can check the audit log to see exactly what happened and when.")


# ===========================================================================
# Renderers
# ===========================================================================
def render_markdown():
    out = [
        "# MakeReady — User Guide",
        "",
        "**Great Mountain West · MakeReady by G54**",
        "",
        f"_Updated {DATE_STR}. Screenshots captured from the live application._",
        "",
        "---",
        "",
    ]
    prev = None
    for kind, payload in C:
        # A list has to be closed with a blank line or the next paragraph is
        # swallowed into the last bullet.
        if kind == "art":
            continue
        if prev in ("b", "n") and kind not in ("b", "n"):
            out.append("")
        prev = kind
        if kind == "h1":
            out += ["", f"# {payload}", ""]
        elif kind == "h2":
            out += ["", f"## {payload}", ""]
        elif kind == "h3":
            out += ["", f"### {payload}", ""]
        elif kind == "p":
            out += [payload, ""]
        elif kind == "b":
            out.append(f"- {payload}")
        elif kind == "n":
            out.append(f"1. {payload}")
        elif kind == "note":
            out += [f"> {payload}", ""]
        elif kind == "shot":
            slug, cap = payload
            out += ["", f"![{cap}]({MD_IMG}/{slug}.png)", "", f"*{cap}*", ""]
        elif kind == "table":
            hdr, rows = payload
            out += ["", "| " + " | ".join(hdr) + " |",
                    "|" + "|".join(["---"] * len(hdr)) + "|"]
            for r in rows:
                out.append("| " + " | ".join(r) + " |")
            out.append("")
        elif kind == "break":
            out += ["", "---", ""]
        elif kind == "art":
            continue
    text = "\n".join(out)
    os.makedirs(os.path.dirname(OUT_MD), exist_ok=True)
    with open(OUT_MD, "w", encoding="utf-8") as f:
        f.write(text + "\n")
    return text


def _md_runs(par, text, size=10.5, color=MID_GRAY):
    """Render **bold** spans inside a paragraph."""
    for i, chunk in enumerate(text.split("**")):
        if not chunk:
            continue
        set_run_font(par.add_run(chunk), size=size, bold=(i % 2 == 1),
                     color=DARK_NAVY if i % 2 == 1 else color)


def render_docx():
    doc = Document()
    set_margins(doc)
    add_footer(doc)
    doc.styles["Normal"].font.name = "Calibri"
    doc.styles["Normal"].font.size = Pt(10.5)

    # ---- cover -----------------------------------------------------------
    bar = doc.add_table(rows=1, cols=1)
    cell = bar.rows[0].cells[0]
    set_cell_bg(cell, ACCENT_BLUE)
    par = cell.paragraphs[0]
    par.paragraph_format.space_before = Pt(10)
    par.paragraph_format.space_after = Pt(10)
    set_run_font(par.add_run("MAKEREADY BY G54  —  USER GUIDE"), size=11, bold=True, color=WHITE)
    cell.width = Inches(6.3)

    par = doc.add_paragraph()
    par.paragraph_format.space_before = Pt(26)
    par.paragraph_format.space_after = Pt(4)
    set_run_font(par.add_run("Running the business in MakeReady"), size=25, bold=True, color=DARK_NAVY)
    par = doc.add_paragraph()
    par.paragraph_format.space_after = Pt(2)
    set_run_font(par.add_run("From the first phone call to a closed month — and where each step happens"),
                 size=12, italic=True, color=MID_GRAY)
    par = doc.add_paragraph()
    set_run_font(par.add_run(f"Great Mountain West  ·  Updated {DATE_STR}"), size=10, color=MID_GRAY)
    add_divider(doc)

    sizes = {"h1": 18, "h2": 14, "h3": 11.5}
    for kind, payload in C:
        if kind in sizes:
            par = doc.add_paragraph()
            par.paragraph_format.space_before = Pt(20 if kind == "h1" else 14)
            par.paragraph_format.space_after = Pt(6)
            set_run_font(par.add_run(payload), size=sizes[kind], bold=True, color=DARK_NAVY)
            if kind == "h1":
                add_divider(doc)
        elif kind == "p":
            par = doc.add_paragraph()
            par.paragraph_format.space_after = Pt(7)
            _md_runs(par, payload)
        elif kind in ("b", "n"):
            par = doc.add_paragraph()
            par.paragraph_format.space_after = Pt(3)
            par.paragraph_format.left_indent = Inches(0.22)
            set_run_font(par.add_run("•  " if kind == "b" else "→  "), size=10.5, bold=True, color=ACCENT_BLUE)
            _md_runs(par, payload)
        elif kind == "note":
            tbl = doc.add_table(rows=1, cols=1)
            cell = tbl.rows[0].cells[0]
            set_cell_bg(cell, LIGHT_GRAY)
            par = cell.paragraphs[0]
            par.paragraph_format.space_before = Pt(6)
            par.paragraph_format.space_after = Pt(6)
            _md_runs(par, payload, size=10, color=MID_GRAY)
            cell.width = Inches(6.3)
            doc.add_paragraph().paragraph_format.space_after = Pt(4)
        elif kind == "shot":
            slug, cap = payload
            path = os.path.join(SHOTS, f"{slug}.png")
            if not os.path.exists(path):
                print(f"  missing screenshot: {slug}")
                continue
            par = doc.add_paragraph()
            par.alignment = WD_ALIGN_PARAGRAPH.CENTER
            par.paragraph_format.space_before = Pt(6)
            par.paragraph_format.space_after = Pt(2)
            # A long full-page capture is taller than the page; size it by
            # height instead so it still lands on one page.
            pw, ph = Image.open(path).size
            if ph / pw > MAX_H / MAX_W:
                par.add_run().add_picture(path, height=Inches(MAX_H))
            else:
                par.add_run().add_picture(path, width=Inches(MAX_W))
            cpar = doc.add_paragraph()
            cpar.alignment = WD_ALIGN_PARAGRAPH.CENTER
            cpar.paragraph_format.space_after = Pt(12)
            set_run_font(cpar.add_run(cap), size=9, italic=True, color=MID_GRAY)
        elif kind == "table":
            hdr, rows = payload
            tbl = doc.add_table(rows=1, cols=len(hdr))
            tbl.style = "Table Grid"
            for i, htext in enumerate(hdr):
                cell = tbl.rows[0].cells[i]
                set_cell_bg(cell, ACCENT_BLUE)
                set_run_font(cell.paragraphs[0].add_run(htext), size=9.5, bold=True, color=WHITE)
            for ri, row in enumerate(rows):
                cells = tbl.add_row().cells
                for i, val in enumerate(row):
                    if ri % 2 == 1:
                        set_cell_bg(cells[i], LIGHT_GRAY)
                    _md_runs(cells[i].paragraphs[0], val, size=9.5)
            doc.add_paragraph().paragraph_format.space_after = Pt(8)
        elif kind == "break":
            add_page_break(doc)
        elif kind == "art":
            continue

    doc.save(OUT_DOCX)



# ---------------------------------------------------------------------------
# Help Center articles — the same guide, browsable inside the platform.
# ---------------------------------------------------------------------------
OUT_TS = os.path.join(ROOT, "platform", "src", "lib", "help", "user-guide.ts")
PLAIN = lambda t: t.replace("**", "")
CHR_NL = chr(10)


def ts(value):
    """A TypeScript literal for a string, list or dict of the above."""
    if isinstance(value, str):
        return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'
    if isinstance(value, (list, tuple)):
        return "[" + ", ".join(ts(v) for v in value) + "]"
    if isinstance(value, dict):
        return "{ " + ", ".join(f"{k}: {ts(v)}" for k, v in value.items()) + " }"
    raise TypeError(value)


def split_articles():
    """Cut the flat block list at the article markers."""
    articles, current = [], None
    for kind, payload in C:
        if kind == "art":
            slug, title, summary, who = payload
            current = {"slug": slug, "title": title, "summary": summary, "who": who, "blocks": []}
            articles.append(current)
        elif current is not None:
            current["blocks"].append((kind, payload))
    # The heading a marker sits on becomes the article title, so drop it.
    for a in articles:
        while a["blocks"] and a["blocks"][0][0] in ("h1", "h2"):
            a["blocks"].pop(0)
    return articles


def help_blocks(blocks):
    """Map guide blocks onto the Help Center's own block vocabulary."""
    out, i = [], 0
    while i < len(blocks):
        kind, payload = blocks[i]
        if kind in ("b", "n"):
            # Runs of bullets or steps become one list / one numbered sequence.
            items = []
            while i < len(blocks) and blocks[i][0] == kind:
                items.append(PLAIN(blocks[i][1]))
                i += 1
            if kind == "b":
                out.append({"k": "list", "items": items})
            else:
                out.append({"k": "steps", "items": [{"text": t} for t in items]})
            continue
        if kind == "p":
            out.append({"k": "p", "text": PLAIN(payload)})
        elif kind in ("h1", "h2", "h3"):
            out.append({"k": "h", "text": PLAIN(payload)})
        elif kind == "note":
            out.append({"k": "tip", "text": PLAIN(payload)})
        elif kind == "shot":
            slug, cap = payload
            out.append({"k": "img", "src": f"guide/{slug}.png", "caption": cap})
        elif kind == "table":
            hdr, rows = payload
            out.append({"k": "table", "headers": [PLAIN(h) for h in hdr],
                        "rows": [[PLAIN(c) for c in r] for r in rows]})
        i += 1
    return out


def render_help_articles():
    arts = split_articles()
    lines = [
        "// The MakeReady user guide, as browsable Help Center articles.",
        "//",
        "// GENERATED — do not edit by hand. The guide is written in",
        "// scripts/generate_user_guide.py, which emits this file alongside the",
        "// Markdown and Word versions so all three say the same thing.",
        "// Regenerate: pnpm guide:shots && python scripts/generate_user_guide.py",
        "",
        'import type { HelpArticle } from "./content";',
        "",
        "export const USER_GUIDE_SECTION = \"User Guide\";",
        "",
        "export const USER_GUIDE_ARTICLES: HelpArticle[] = [",
    ]
    slugs = [a["slug"] for a in arts]
    for order, a in enumerate(arts):
        # Related: the step either side, so the guide can be read straight through.
        related = [s for s in (slugs[order - 1] if order else None,
                               slugs[order + 1] if order + 1 < len(slugs) else None) if s]
        lines += [
            "  {",
            f"    slug: {ts(a['slug'])},",
            f"    title: {ts(a['title'])},",
            "    section: USER_GUIDE_SECTION,",
            f"    order: {order},",
            f"    summary: {ts(a['summary'])},",
            f"    who: {ts(a['who'])},",
            f"    related: {ts(related)},",
            "    blocks: [",
        ]
        for blk in help_blocks(a["blocks"]):
            lines.append(f"      {ts(blk)},")
        lines += ["    ],", "  },"]
    lines += ["];", ""]

    os.makedirs(os.path.dirname(OUT_TS), exist_ok=True)
    with open(OUT_TS, "w", encoding="utf-8", newline=CHR_NL) as f:
        f.write(CHR_NL.join(lines))
    return arts


def main():
    text = render_markdown()
    render_docx()
    arts = render_help_articles()
    shots = sum(1 for k, _ in C if k == "shot")
    print(f"{OUT_MD}  ({len(text.splitlines())} lines)")
    print(f"{OUT_DOCX}  ({shots} screenshots)")
    print(f"{OUT_TS}  ({len(arts)} help articles)")


if __name__ == "__main__":
    main()
