# GMW Finance — how it actually works in SAP B1

Reverse-engineered from the live `GMGoLive` SAP Business One database (132 GB,
restored locally), covering **Feb 2008 → 23 Jul 2026**. Every number below came
from the data, not from documentation. This is the requirements baseline for the
MakeReady finance build.

Source artifacts (scratchpad): `table_rows.csv` (560 non-empty tables),
`finance_schema.csv` (4,998 columns across 36 finance tables), `OACT_full.csv`
(chart of accounts), `user_queries.csv` (736 saved reports).

---

## 1. The shape of the business, financially

| Measure | FY2026 (Oct 25–Jul 26) | FY2025 | FY2024 | FY2023 |
|---|---|---|---|---|
| Cash collected (incoming payments) | $10.6M | $12.9M | $12.4M | $13.3M |
| Cash paid out (outgoing payments) | $7.7M | $9.1M | $8.6M | $9.3M |
| AR invoices issued | 14,516 | ~18,000 | ~18,000 | ~18,000 |
| AP invoices received | 5,832 | ~8,000 | ~8,000 | ~8,000 |
| Incoming payments | 3,424 | 4,219 | 4,118 | 4,100 |
| Outgoing payments | 1,304 | 1,821 | 1,672 | 1,933 |
| Checks written | 634 | 813 | 857 | 1,053 |
| Deposits made | 772 | ~1,000 | ~1,000 | ~1,000 |
| Manual journal entries | 157 | ~250 | ~250 | ~250 |

18 years of history: 1,057,550 journal entries / 2,741,182 journal lines,
250,568 AR invoices, 157,782 AP invoices, 88,201 incoming payments.

Open AR at 23 Jul 2026: **$2,050,118** across 1,978 invoices.

---

## 2. Fiscal calendar — **October to September**

This is the single most important structural fact and MakeReady currently has it
wrong (it assumes calendar years).

- Fiscal year runs **1 Oct → 30 Sep**, labelled by the *ending* calendar year:
  FY2026 = 1 Oct 2025 → 30 Sep 2026.
- **12 monthly periods** per year, named `YYYY-NN` where `NN` is 1–12 *from
  October*: period `2026-01` = October 2025, `2026-12` = September 2026.
- Quarters therefore are **Q1 Oct–Dec, Q2 Jan–Mar, Q3 Apr–Jun, Q4 Jul–Sep**.
- Periods carry a status: 268 historic periods locked (`Y`), 3 in closing (`C`),
  51 future unlocked (`N`). Posting is blocked into locked periods.
- Periods are defined out to FY2030 — the calendar is maintained years ahead.

Every "this year", "YTD", "last quarter", "budget year" in this business means
the Oct–Sep year. Comparatives, quarterly packs and year-end all pivot on 30 Sep.

---

## 3. Chart of accounts — segmented, 4 + 3

350 accounts, 285 postable, in 8 drawers (SAP's `GroupMask`):

| Drawer | Accounts | Meaning |
|---|---|---|
| 1 Assets | 56 | cash, AR, inventory, fixed assets, accum. depreciation |
| 2 Liabilities | 88 | AP, accruals, sales tax, notes payable, ROU lease liabilities |
| 3 Equity | 7 | capital, retained earnings, Current YTD P&L |
| 4 Revenues | 21 | sales, returns, discounts, shipping out |
| 5 Cost of Sales | 67 | COGS, royalties, samples, PPV, inventory adjustments, freight in |
| 6 Operating Costs | 82 | payroll, supplies, repairs, rent, utilities, travel, marketing |
| 7 Non-Operating | 16 | bad debt, donations, penalties, depreciation, amortization |
| 8 Taxation | 13 | state/federal income tax provision, deferred tax |

**Account codes are two segments: `NNNN` (natural account) + `SSS` (segment).**
Stored in SAP as `Segment_0` / `Segment_1`, displayed as a 7-digit code.

Segment values in live use:

| Segment | Meaning | Kind |
|---|---|---|
| `100` | HG — Hard Goods | product line |
| `200` | SG — Soft Goods | product line |
| `300` | HW — Headwear | product line |
| `510` | Art | production dept |
| `520` | Emb — Embroidery | production dept |
| `530` | WH — Warehouse | production dept |
| `540` | SS — Silkscreen | production dept |
| `550` | SH & DTF | production dept |
| `640` | Mngt | overhead dept |
| `650` | Sales | overhead dept |
| `660` | Purch | overhead dept |
| `670` | Office | overhead dept |
| `690` | Admin / Development | overhead dept |
| `000` | unsegmented (balance sheet) | — |

So `3005200` = Sales · Soft Goods, `4005100` = COGS · Hard Goods,
`5404540` = Supplies · Silkscreen, `6005650` = Payroll · Sales.

The entire P&L is read by segment: revenue and COGS by product line (HG/SG/HW),
labour and supplies by production department, overhead by function. **SAP's
Dimensions / Profit Centers / Distribution Rules are empty — the segment in the
account code is the only analytical axis they use.** Any MakeReady P&L that
can't slice by segment is unusable to them.

Control accounts (per fiscal year, SAP `OACP`):
AR = `1106000 Accounts Receivable`, AP = `2005000 Accounts Payable`,
checks clearing = `1006000`, petty cash = `1015000`,
card deposits = `1010000`, default revenue = `3005100 Sales (HG)`,
default expense = `7888690 Misc Expense`, YTD earnings = `2914000 Current YTD Profit & Loss`.

Banks: `1004000 Checking - CCBank` (primary, $2.04M), `1005000 Checking - AltaBank`,
`1342000 Money Market - CCBank` ($157k), plus a `2xxx` line of credit with CCBank ($295k drawn).

---

## 4. Where journal entries come from

FY2008–FY2026 entry counts by SAP transaction type — this is the auto-posting
surface MakeReady has to reproduce:

| Source | Entries | Value | FY2026 |
|---|---|---|---|
| AR Invoice | 250,568 | $184.2M | 14,516 |
| Delivery (COGS + inventory relief) | 209,846 | $172.6M | 11,247 |
| Goods Receipt PO (→ GRNI) | 162,062 | $79.8M | 7,601 |
| AP Invoice | 157,782 | $131.1M | 5,832 |
| Incoming Payment | 89,635 | $183.6M | 3,564 |
| Outgoing Payment | 42,664 | $138.9M | 1,336 |
| Goods Receipt (inventory) | 39,245 | — | 1,444 |
| Period-end / carry-forward | 35,382 | $847.7M | 1,141 |
| AR Credit Memo | 22,709 | −$5.4M | 464 |
| Goods Issue | 19,036 | — | 1,081 |
| **Deposit** | 14,604 | $181.2M | 772 |
| **Manual JE** | 4,468 | $151.1M | 157 |
| AP Credit Memo | 3,300 | −$2.8M | 98 |
| Checks for payment | 2,758 | — | 114 |
| Landed costs | 1,667 | $4.4M | 14 |
| Inventory revaluation | 341 | $4.8M | — |

Busiest FY2026 accounts by line count: Inventory (22,395), AR (18,601),
GRNI (12,775), Sales SG (10,303), COGS SG (8,177), AP (7,274), Checks
Clearing (7,228), Sales Tax (5,930 lines).

---

## 5. Order-to-cash (AR)

### 5.1 Terms drive everything
56 payment-term groups. Live usage FY2026:

| Terms | Customers | FY26 invoices | FY26 value |
|---|---|---|---|
| Net 30 | 1,890 | 10,782 | $6.74M |
| Net 60 | 252 | 2,006 | $2.25M |
| Credit Card | 891 | 670 | $0.81M |
| Net 90 | 26 | 293 | $0.29M |
| Net 45 | 50 | 166 | $0.62M |
| Net 30 (CC) | 55 | 141 | $0.21M |
| PayPal | 7 | 103 | $16k |
| C.O.D. | 5 | 69 | $99k |

Plus non-credit statuses used as terms: `Closed`, `Inactive Account`,
`Don't Sell`, `Collections`, `COD/Bankruptcy`, `Get App`, `Determining`,
`In House`, `Trade`, `Interest`, `Fee`. Cash-discount terms exist
(`2% 10 Net 30`, `1.5% 10 Days Net 30`, `1% 10 Days Net 30`, `7% Net 60`) and
split terms (`1/2 30 1/2 60`, `50%D 50%TT`, `30%D 70%TT`, `50%D, Net10`).

**The terms field is the credit policy, the collection trigger and the
account-status flag all at once.** MakeReady's free-text `terms` string can't do
this.

### 5.2 Customers
7,109 customers · 2,180 with credit limits (avg $5,624) · 4,433 inactive ·
**2,185 are children of a parent account** (`FatherCard`) — Paradies, Fly,
Walmart-style hierarchies where invoices bill the child but collections,
statements and EDI run at the parent.

### 5.3 Cash application is two-step
1. **Incoming Payment** (`ORCT`) — Dr `1006000 Checks Clearing`, Cr AR.
   Applied across **many** invoices: 88,201 payments → 257,887 applications
   (mean 2.9 invoices per cheque; the `RCT2` table).
2. **Deposit** (`ODPS`) — batches receipts: Dr `1004000 Checking - CCBank`,
   Cr Checks Clearing. 14,311 cheque deposits worth $177M; 292 cash deposits.

Every receipt in 18 years lands in the cheque bucket — card payments are charged
outside SAP and arrive as settlement deposits. `1010000 Credit Card Deposits` is
the landing account.

Then **internal reconciliation** (`OITR`, 360,440 reconciliations / 1.14M lines)
matches open AR items automatically (types 3, 13, 9, 11, 6 — all system) with a
manual override path (185 manual reconciliations in FY2026).

### 5.4 Collections — the daily/weekly worklists
Straight from their saved queries:

- **"Invoices to Charge — Daily"** — open invoices whose terms are
  `Net 30 (CC) / Net 14 (CC) / Prepaid / Credit Card / C.O.D.` and whose **due
  date is today** → the card-on-file charging run.
- **"Invoices to Charge — All Due"** — same, already past due.
- **"Prepayment Invoices still open" / "Prepayment Deliveries"** — Prepay/Credit
  Card orders that must be collected before the goods leave.
- **"Past Due"** — open invoices **exactly 15 days past due**, excluding 11
  parent accounts and 27 named customers, and excluding terms groups 2/11/28
  (COD, Trade, Interest). This is the dunning trigger.
- **"AR_Invoices_by_Customer_Open"** — open AR by customer with credits applied.
- **"AR_Receipts_by_Date"** — receipts by due/posting date with cash/card/cheque split.
- **"Credits to Submit"** — credit memos to transmit by EDI to a parent account.

There is **no SAP dunning module in use** (`ODUN` empty) — collections is these
queries plus phone calls. Invoices for the large accounts go out by **EDI 810**
(flagged `U_NBS_EDIinv`), credits by EDI too.

### 5.5 AR aging at 23 Jul 2026

| Bucket | Invoices | Balance |
|---|---|---|
| Current | 1,640 | $1,605,541 |
| 1–30 | 174 | $295,955 |
| 31–60 | 40 | $36,175 |
| 61–90 | 28 | $22,827 |
| 91–120 | 27 | $24,615 |
| 120+ | 69 | $65,005 |

78% current. Their aging is healthy and they watch the 15-day mark hard.

---

## 6. Procure-to-pay (AP)

- AP invoices post against **GRNI** (`2393000 Goods Received Not Invoiced`) raised
  by the goods receipt — 12,775 GRNI lines in FY2026. Unmatched GRNI is cleaned
  up by manual JE at month end ("In house GRs", "open GRs will not rcv inv").
- **Payment runs**: SAP's payment wizard, **28–48 runs a year** (weekly-ish).
  Selects due AP by date/vendor/amount, produces cheques and bank transfers.
- Payment mix FY2026: **$6.52M transfer (ACH/wire) vs $1.18M cheques** — 85% ACH.
- Payment methods configured: `ACH Payment`, `Check`, `Credit Card Payment`,
  `Online Payment`, `Wire Transfer` — all drawn on Checking-CCBank.
- 634 cheques written FY2026, 14 voided. Cheque register lives in `OCHO`/`CHO1`.
- **1099s are not tracked in SAP** (`Form1099` is 0 on all 13,521 recent AP
  invoices) — handled outside by the accountant.

---

## 7. Sales tax

- 18 tax codes, one per state where they have nexus: AR, AZ, CA, CO, CT, ID, IL,
  ME, MI, MT, NM, OH, PA, TX, UT, WA, WY + `EX` Exempt.
- Rates are **state-level** (UT 7.65, CA 7.50, TX 6.25, CO 2.90, MT 0.00 …),
  held against a full 50-state authority table.
- Tax posts to `2222000 Sales Tax Payable`; 5,930 tax lines in FY2026.
- Per-line tax detail in `UTX1` (6.8M rows) — tax is computed and stored per
  invoice line, not per document.
- Customer tax status is set per ship-to address (`CRD1.TaxCode`), with an
  exemption flag on the BP.
- No AvaTax/third-party engine — rates and returns are SAP-native, filed per
  state per period.

---

## 8. Month-end close — what finance actually posts by hand

157 manual JEs in FY2026. The recurring pattern, from the memos:

1. **Semi-monthly payroll** — a JE on the 10th and the 25th of every month,
   $110k–$178k each (~$3.3M/yr), split across ~14 departmental payroll accounts
   (`5005510/520/530/540` production, `6005640/650/660/670/690` overhead), plus
   overtime accounts, payroll taxes, medical/dental/HSA, and 401k.
2. **Accrued payroll at month end** — e.g. "3/10/26 Accrued Payroll" posted
   28 Feb, reversing into the 10 Mar payroll run. Every month, ~$160k.
3. **Vacation accrual** (`6111690`) and **bonus accrual** (`2110000 Employee
   Bonus Payable`, e.g. "2025 Bonus" $194k in November).
4. **Credit-card merchant fees** (`6609670`) — 84 entries, $131k/yr.
5. **GRNI clean-up** — clearing receipts that will never be invoiced.
6. **"Adjust to Actual"** entries at period end, and **"9.30.25 YE Adjust to
   Actual"** at year end.
7. **Deposits in transit** at the boundary ("14750.51 9/30 deposit in Oct").
8. **Credit write-offs** for small balances.

SAP's recurring-posting and posting-template features are **not used** — every
one of these is typed by hand each month. That is the single biggest time sink
MakeReady can remove.

Year-end: Sep 30 adjustments, then the period-end carry-forward to
`2914000 Current YTD Profit & Loss` (1,766 lines / $22.7M in FY2026).

---

## 9. Banking

- **~12 bank statements a year** reconciled (`OBNK`) — monthly external bank
  reconciliation against the cash accounts.
- Cash-flow reporting **is** configured: SAP's cash-flow line items (31 lines,
  Operating / Investing / Financing) with 55,877 transactions tagged
  (`OCFT`) — so a real Statement of Cash Flows is produced, not just P&L/BS.

Cash-flow line items in use include: payments for customer invoices, customer
down payments, payments to vendors, rent, electricity, phones, wages, corporate
income tax, interest paid, fixed-asset purchases/sales, long-term borrowings,
finance-lease payments, loan repayments, dividends.

---

## 10. Reporting — 736 saved queries

Categories that matter to finance:

- **AR_Queries (32)** — the collections desk (§5.4).
- **Purchasing (36)** — approved POs, PO approval over $500, drop-ships due,
  expediting domestic/import, GRNI without AP invoice, royalty checks, ROP alerts.
- **BP Queries (8)** — Past Due, Payment Method, Tax Status, Customer Info,
  Territory Report, Vendors, "Kim Lund Report".
- **KPI_MOBILE (4)** — **Cash on Hand**, **Incoming Payments MTD vs last month**,
  **Outgoing Payments MTD vs last month**, **Sales Orders MTD vs last month**.
  These four are the executive pulse.
- **SAP_DASHBOARD_\* (250)** — the aging/collections dashboard pack: overdue by
  X days and 90+, future remittance by aging date, overdue by salesperson, top-5
  customers/reps by overdue and by revenue, **monthly budget vs projection vs
  revenue by salesperson**, sales quota by month.
- **B1WebAPI_Expense (54)** — a full **employee expense system**: requests →
  approvals → claims → booking → PO/AP, split between company-issued cards and
  employee-paid, coded to GL account **segments**, with approval chains and
  analysis reports.
- **ZEDS dashboards** — 3 role-based dashboards (exec / manager / rep) with KPI
  targets stored as data: LeadToQuote 0.40, QuoteToClose 0.50, AvgPurchaseValue
  14, SalesRevPerMth 35, SalesGrowth 15%, plus per-rep monthly revenue targets.

**Sales goals are a custom table** (`@GMWS_SALES_GOALS_MO`, 3,497 rows since
FY2009): goal dollars per salesperson per month per fiscal period. Budget vs
actual by rep by month is a live report.

Custom print layouts maintained in-house: "2026 NEW Invoice", "2026 6 Invoice
NEW", "2025 Credit Memo", "2025 Credit Draft".

---

## 11. What is NOT used (deliberate scope exclusions)

- Dimensions / profit centres / distribution rules — empty. Segments do this job.
- Budgets — last maintained FY2016; budgeting happens in Excel today.
- Dunning wizard, recurring postings, posting templates — empty.
- 1099 / withholding tax — not tracked in SAP.
- Fixed-asset add-on — 1 asset row; depreciation is booked by JE.
- Multi-currency — 3 currencies defined, 1 exchange rate row: **USD only**.

---

## 12. Gap analysis vs MakeReady today

MakeReady already has: chart of accounts, journal + ledger, trial balance, P&L,
balance sheet, cash flow, aging, statements, AR invoices + payments, AP bills +
payments, bank reconcile, recurring JEs, sales-tax + commission reports, fixed
assets + depreciation, cost centres, job costing, budgets, landed cost, GRNI.

Gaps that block GMW from running finance on it:

| # | Gap | Why it matters |
|---|---|---|
| 1 | **No fiscal calendar** — calendar-year assumptions, single close date | Their year is Oct–Sep. Every report, comparative and close is wrong without it. |
| 2 | **Flat account codes** — no segments | The whole P&L is read by product line and department. |
| 3 | **Journal lines carry no analytics** — no BP, segment, period, or document link | Can't produce a sub-ledger-to-GL tie-out or a segmented P&L. |
| 4 | **One payment = one invoice** | Real cheques pay 2.9 invoices on average; no on-account cash. |
| 5 | **No deposits** — payments post straight to cash | Breaks bank rec; they bank in batches through a clearing account. |
| 6 | **No credit memos** (AR or AP) | 22,709 AR credit memos in history; 464 last year. |
| 7 | **No collections worklists** | The 15-day past-due run and the daily card-charge run are the AR desk's job. |
| 8 | **No parent/child billing rollup** | 2,185 customers bill to a parent. |
| 9 | **No AP payment runs** | 40 runs a year selecting due bills into cheque + ACH batches. |
| 10 | **Single tax rate per invoice** | 18 state codes, per-line tax, per-state filing. |
| 11 | **Close is one global date** | Needs per-period lock, closing entries, YE roll to retained earnings. |
| 12 | **No payroll JE template** | 24 hand-typed payroll JEs + 12 accruals a year across 14 accounts. |
| 13 | **Budgets annual + by account only** | They need monthly budget/goal by rep and by segment. |
| 14 | **No finance KPI pack** | Cash on hand, incoming/outgoing MTD vs LM, aging, budget vs actual. |
| 15 | **No expense claims** | 54 queries' worth of process running today in an add-on. |

---

## 13. Build plan — status

All five phases are built. Migrations 0080–0083, applied to Neon.

- **Phase A — foundation** *(commit `74d95ba`)*: `fiscal_years` / `fiscal_periods`
  (Oct–Sep, open/closing/locked, FY2008–FY2031 seeded), `gl_segments` with the
  14 live values, accounts split into natural code + segment, journal lines
  carrying business partner and segment, entries stamped with their period,
  period-aware posting guard, auto-reversing accruals. Screens:
  `/accounting/periods`, `/accounting/segment-pnl`.
- **Phase B — receivables** *(commit `0c8ed67`)*: `payment_terms` (56 imported
  from SAP, with card-on-file / prepay / credit-allowed behaviour),
  `credit_memos`, `ar_applications` (one receipt across many invoices, cash on
  account), `deposits` through Checks Clearing, parent/child billing. Screens:
  `/accounting/collections`, `/accounting/credit-memos`, `/accounting/deposits`,
  the payment apply screen. All 7,109 customers mapped to terms, 2,180 credit
  limits, 2,185 parent links.
- **Phase C — payables** *(commit `b145069`)*: weekly `payment_runs` (select →
  approve → pay, one instrument per vendor, one journal entry per batch),
  `vendor_credits`, GRNI aging. Screens: `/accounting/payment-runs`,
  `/accounting/vendor-credits`, `/accounting/grni`.
- **Phase D — tax** *(commit `100f255`)*: `tax_codes` for the 18 states of nexus
  at their real rates, per-invoice jurisdiction, customer default + exemption
  certificates, and a per-state filing worksheet at `/accounting/tax-filing`.
  5,148 customers defaulted from their ship-to state.
- **Phase E — close & reporting** *(commit `edc0f64`)*: weekly flash with the
  four KPIs SAP's mobile dashboard carried, a quarterly pack with prior-year and
  YTD comparatives plus the segment split, and a period close driven by a real
  checklist. Screens: `/accounting/flash`, `/accounting/quarterly`,
  `/accounting/close`.

### Verification
- `pnpm verify:ar` — end-to-end cash application on real tables (one cheque over
  three invoices, partial payment, cash on account, credit memo absorbing the
  rest, over-application refused), self-cleaning.
- `npx tsx scripts/verify-finance-pages.ts` — renders all 21 finance screens
  against a live session.

### Known gaps
- Payment runs and GRNI show empty until live purchasing flows through the
  platform: all 157,770 bills imported from SAP are historical and settled, and
  no goods receipts have been entered.
- The payroll journal template (24 hand-typed payroll entries and 12 accruals a
  year across ~14 departmental accounts) is not built; the accrual machinery it
  needs — auto-reverse plus `runDueReversals` — is.
- Monthly budget/goal vs actual by rep (SAP's `@GMWS_SALES_GOALS_MO`, 3,497 rows
  since FY2009) is not built.
- Employee expense claims (the 54-query add-on) are not built.
