# Accounting, Controlling & Asset Accounting

**Wireframes:** /accounting.html · /controlling.html · /assets.html
**Epic refs:** 7.1–7.11
**Stakeholders (Finance):** Britney de Jong (Accounting, AP), Leslie Weiler (AR, Reports)

---

## Overview

The Finance module covers the full accounting suite that will replace G54's current SAP Business One installation. It handles the full AR document flow (already defined in Sales), AP, bank reconciliation, GL/journal entries, cost center tracking (Controlling), and fixed asset management.

Finance access is restricted to users with the Finance/Accounting role. Sales and Production members have read-only access to documents directly related to their work (e.g., a Sales Rep can see the invoice status for their order, but cannot access the ledger).

---

## Accounting

**Stakeholders:** Britney de Jong (Accounting, AP)

### US-ACC-01: Chart of Accounts
**As a** Finance member  
**I want to** view and manage the Chart of Accounts  
**So that** all financial transactions are posted to the correct GL accounts

**Acceptance Criteria:**
- Given the SAP B1 data migration is complete, then the Chart of Accounts is imported in full (account number, name, type, level)
- Given I create a new account, then I must specify: account number, account name, account type (Asset, Liability, Equity, Revenue, Expense)
- Given I deactivate an account, then it cannot be used in new transactions but historical postings remain

---

### US-ACC-02: Accounts Receivable
**As a** Finance member (Leslie Weiler)  
**I want to** see all outstanding AR invoices and their aging  
**So that** I can monitor cash collection and follow up on overdue accounts

**Acceptance Criteria:**
- Given I am on the AR view, then I see: all open invoices, customer name, invoice date, due date, balance, aging bucket (Current / 1-30 / 31-60 / 61-90 / 90+ days)
- Given an invoice is overdue, then it is visually flagged
- Given I select a customer, then I can see all of their open and paid invoices
- AR aging report must be exportable to PDF and CSV

---

### US-ACC-03: Accounts Payable
**As a** Finance member (Britney de Jong)  
**I want to** record and manage vendor invoices  
**So that** G54 pays vendors on time and AP liability is tracked accurately

**Acceptance Criteria:**
- Given I create a vendor invoice (AP), then I must enter: vendor name, invoice number, invoice date, due date, amount, and GL account
- Given I record a vendor payment, then the AP invoice balance is reduced accordingly
- Given I view the AP aging report, then I see all outstanding vendor invoices by aging bucket
- AP aging must be exportable to PDF and CSV

---

### US-ACC-04: Bank Reconciliation
**As a** Finance member  
**I want to** reconcile bank statement transactions against recorded payments  
**So that** the GL cash balance matches the bank statement balance

**Acceptance Criteria:**
- Given I import or manually enter bank statement lines, then I can match each line to a recorded incoming payment or outgoing payment in MakeReady
- Given a bank line is matched, then it is marked reconciled
- Given reconciliation is complete, then the difference between GL balance and bank balance is shown as $0 (or the unreconciled amount is clearly indicated)
- [TBD — bank statement import format: CSV, OFX, manual entry?]

---

### US-ACC-05: Journal Entries
**As a** Finance member  
**I want to** create manual journal entries  
**So that** I can post adjustments, accruals, and corrections

**Acceptance Criteria:**
- Given I create a journal entry, then I must enter at least one debit and one credit line that balance to zero
- Given I save a journal entry, then it posts to the GL immediately and is included in financial reports
- Given a journal entry is posted, then it cannot be deleted — only reversed with a counter-entry

---

## Controlling (Cost Centers & Budgets)

**Stakeholders:** Britney de Jong, Tyson Johnson (Operations/Process)

### US-CTRL-01: Cost Centers
**As a** Finance member  
**I want to** assign transactions to cost centers (departments)  
**So that** I can report P&L at the department level

**Acceptance Criteria:**
- Given cost centers exist, when I post any revenue or expense transaction, then I can optionally assign a cost center
- Cost centers are managed in Administration

---

### US-CTRL-02: Budget vs Actual
**As a** Finance member  
**I want to** enter annual budgets per cost center and track actuals against them  
**So that** department heads can see how spending tracks against plan

**Acceptance Criteria:**
- Given I enter a budget for a cost center and period, then the Controlling dashboard shows budget, actual, and variance
- Budget variances greater than [TBD]% are highlighted

---

## Asset Accounting (Fixed Assets)

**Stakeholders:** Kim Lund (Finance/Sales — overlap TBD)

### US-ASSET-01: Fixed Asset Register
**As a** Finance member  
**I want to** maintain a register of G54's fixed assets  
**So that** assets are tracked, insured, and depreciated correctly

**Acceptance Criteria:**
- Given I create an asset record, then I enter: asset name, asset type (Equipment, Vehicle, Leasehold Improvement, etc.), purchase date, purchase cost, useful life (years), depreciation method (Straight-Line, Declining Balance), and residual value
- Given an asset is created, then the system calculates annual and monthly depreciation automatically
- Given I view the asset register, then I see: asset name, book value, accumulated depreciation, and net book value

---

### US-ASSET-02: Depreciation Runs
**As a** Finance member  
**I want to** run monthly depreciation across all active assets  
**So that** depreciation is posted to the GL automatically

**Acceptance Criteria:**
- Given I run depreciation for a period, when I confirm, then depreciation journal entries are posted to the GL for every active asset
- Given depreciation has been posted for a period, then the run is locked and cannot be reversed without Admin override
- Depreciation run must be idempotent — running it twice for the same period does not post duplicate entries

---

## SAP Business One Migration Notes

All accounting data migrates from SAP Business One into MakeReady. The migration covers:

| Data | Migration Approach |
|---|---|
| Chart of Accounts | Full import; account numbers preserved |
| Open AR Invoices | Migrated as open items with original dates |
| Open AP Invoices | Migrated as open items with original dates |
| Paid Invoices (historical) | [TBD — full history vs. period cutoff] |
| Fixed Asset Register | Full import with book values as of migration date |
| Cost Centers | Full import |
| Opening Balances | Trial balance as of migration date posted as opening journal entry |

See [technical/integrations.md](../technical/integrations.md) for migration plan detail.
