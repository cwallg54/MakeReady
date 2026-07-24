# Integrations & Data Migration

---

## Integration Overview

MakeReady uses **direct integrations only** — no middleware or iPaaS layer (Vision33 Saltbox has been removed). All external connections are API-to-API.

| Integration | Type | Direction | Status |
|---|---|---|---|
| SAP Business One | Data migration (one-time) | SAP B1 → MakeReady | Required before go-live |
| Web Store (store.g54.com) | Native module | Bidirectional | Built-in; no external system — **only if native Web Store is built (see below)** |
| Existing eCommerce platform | Direct API integration | Bidirectional | **Alternative to the native Web Store — only if G54 retains its current storefront** |
| Anthropic Claude API | AI service | MakeReady → Claude | Content Library NLP + tagging |
| Email service | Transactional email | MakeReady → Email provider | Notifications, approvals, password reset |
| Cloud file storage (S3/Azure) | Object storage | MakeReady → Storage | Content Library uploads |

---

## SAP Business One — Data Migration

### Scope

All master data and open transactions migrate from SAP Business One into MakeReady before go-live. Historical closed transactions are migrated based on a cutoff date to be confirmed with Finance.

| Data Category | Entity | Notes |
|---|---|---|
| Master Data | Business Partners (Customers) | All fields; BP numbers preserved |
| Master Data | Contacts per BP | |
| Master Data | Chart of Accounts | Account numbers preserved |
| Master Data | Item Master | Item codes preserved; web store flags reset |
| Master Data | Vendors | For AP |
| Master Data | Cost Centers | |
| Master Data | Fixed Asset Register | Book values as of migration date |
| Open Transactions | Open Sales Orders | Status mapped to MakeReady equivalents |
| Open Transactions | Open AR Invoices | Balances as of migration date |
| Open Transactions | Open AP Invoices | Balances as of migration date |
| Open Transactions | Open Deliveries | |
| Historical | Paid Invoices | [TBD — confirm cutoff date with Kim Lund] |
| Historical | Closed SOs | [TBD — confirm cutoff with Kim/Leslie] |
| Financial | Trial Balance | Opening balances posted as of migration date |

### Migration Process

1. **Extract** — SAP B1 exports to CSV/Excel using standard B1 export tools
2. **Transform** — Migration scripts validate, clean, and map field names to MakeReady schema
3. **Load** — Scripts load via admin API (preferred) or direct DB insert with referential integrity checks
4. **Validate** — Finance team (Kim Lund, Britney de Jong, Leslie Weiler) validates record counts, BP list, and open balance totals against SAP B1 reports
5. **Cutover** — On cutover date, SAP B1 is frozen; all new transactions enter MakeReady
6. **Parallel running** — [TBD duration] weeks of parallel operation before SAP B1 is decommissioned

### Field Mapping (Key Examples)

| SAP B1 Field | MakeReady Field | Notes |
|---|---|---|
| CardCode | business_partner.bp_number | Preserve exactly |
| CardName | business_partner.company_name | |
| GroupCode | business_partner.account_group_id | Map group codes to MakeReady Account Groups |
| CreditLimit | business_partner.credit_limit | |
| ItemCode | item.item_code | Preserve exactly |
| ItemName | item.item_name | |
| U_WebStore (custom field) | item.web_store_published | [TBD — confirm SAP field name] |
| DocNum (Sales Order) | sales_order.so_number | Prefix "SO-" added |
| DocNum (AR Invoice) | ar_invoice.invoice_number | Prefix "INV-" added |

*Full field mapping document to be produced during migration planning phase.*

### Migration Contacts

| Role | Contact |
|---|---|
| Finance validation lead | Kim Lund — kim@g54.com |
| AR validation | Leslie Weiler — leslie@g54.com |
| AP validation | Britney de Jong — britney@g54.com |
| IT / Technical lead | Christopher Wall |

---

## Web Store (store.g54.com)

> **Decision pending — build vs. integrate.** The eCommerce approach is an open decision (see [SOW](../../SOW.md) Phase 3). Two paths:
> - **Build native (default below):** MakeReady includes a native Web Store module serving store.g54.com. Removes the third-party dependency.
> - **Integrate existing:** If G54 retains its current eCommerce platform, MakeReady skips the native module and instead exposes a direct API integration — orders sync in, status/inventory sync out (same events as below). Lower scope and cost; priced separately.
>
> The remainder of this section describes the **native Web Store** path.

The Web Store is a **native MakeReady module**, not an external system integration. However, the storefront website (store.g54.com) is a customer-facing application that communicates with MakeReady via internal API.

### Web Store → MakeReady Events

| Event | MakeReady Action | Latency Target |
|---|---|---|
| Customer places order | Create Sales Order (WEB- prefix) | < 60 seconds |
| Customer updates shipping address | Update SO shipping fields | < 60 seconds |
| Customer cancels order (pre-production) | Cancel SO | < 60 seconds |

### MakeReady → Web Store Events

| Event | Web Store Action | Latency Target |
|---|---|---|
| SO status changes (confirmed, in production, shipped) | Update Web Store order status display | < 5 minutes |
| Delivery created with tracking number | Display tracking number in Web Store order | < 5 minutes |
| Item stock level changes | Update storefront availability | Per publish schedule (Real-time / 15 min / hourly / daily) |
| Item published/unpublished | Show/hide on storefront | < 60 seconds |
| BP Account Group changes | Update customer's pricing and catalog access | On next customer login |

---

## Anthropic Claude API — Content Library

### Usage

| Function | API Type | Notes |
|---|---|---|
| Image analysis (auto-tagging) | Claude Vision (claude-opus-4-8 or claude-sonnet-4-6) | Called on every upload |
| Asset description generation | Claude Vision | Called on every upload; description stored in DB |
| NLP search query interpretation | Claude text | Called on every NLP search query |
| Embedding generation | Embedding model [TBD] | For vector similarity search |

### Configuration

- API key stored in environment variable (never in code or DB)
- Configurable in Administration → Integration Settings
- Fallback: if API call fails, asset is uploaded successfully and flagged for manual tagging; search still works via keyword/tag matching

### Cost Considerations

- Each upload triggers 1 Vision API call (tagging + description): ~[TBD] tokens
- Each NLP search triggers 1 text API call: ~[TBD] tokens
- Budget alerts should be configured in the Anthropic console [TBD threshold]

---

## Email Service

Transactional emails sent by MakeReady:

| Trigger | Recipient | Template |
|---|---|---|
| New user account created | New user | Welcome + set-password link |
| Password reset requested | Requesting user | Reset link (1-hour expiry) |
| Account locked (5 failed logins) | Admin | Alert |
| Approval required | Approver | Link to pending item |
| Order approved/rejected | Sales Rep | Decision + reason |
| Web Store order received | Sales Manager | Summary |

Email provider: [TBD — Resend, SendGrid, or AWS SES]
From address: [TBD — e.g., noreply@makeready.g54.com]
