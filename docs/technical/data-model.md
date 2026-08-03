# Data Model

Key entities and their relationships. This is not a full schema — it defines what exists, its key fields, and how entities relate. The dev firm will own the final schema design.

---

## Entity Map

```
account_group ──────────┐
                         ├── business_partner ──── contact
price_list ─────────────┘         │
                                   ├── quote ──────── quote_line_item
                                   ├── sales_order ── so_line_item ── item
                                   │       │
                                   │       ├── job ── job_artwork ── content_asset
                                   │       ├── delivery
                                   │       └── ar_invoice ── incoming_payment
                                   └── activity_log

user ──── role
      └── audit_log

content_asset ── asset_collection_member ── collection
            └── asset_tag
            └── job_artwork
```

---

## Entities

### `user`
| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| name | string | Full name |
| email | string | Unique; used for login |
| password_hash | string | bcrypt |
| roles | string[] | Array of role slugs: admin, sales_manager, sales_rep, finance, production, art_dept |
| is_active | boolean | Inactive users cannot log in |
| created_at | timestamp | |
| last_login_at | timestamp | |

---

### `account_group`
| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| name | string | e.g., Standard, Wholesale, Government |
| price_list_id | FK → price_list | Controls storefront pricing |
| web_store_enabled | boolean | Whether BPs in this group can access the Web Store |

---

### `business_partner`
| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| bp_number | string | System-generated; format: BP-XXXXX |
| company_name | string | |
| account_group_id | FK → account_group | |
| credit_limit | decimal | Null = no limit |
| payment_terms | string | e.g., Net 30, Net 60 |
| web_store_status | enum | published, unpublished, pending |
| created_at | timestamp | |
| created_by | FK → user | |

---

### `contact`
| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| business_partner_id | FK → business_partner | |
| first_name | string | |
| last_name | string | |
| title | string | |
| email | string | |
| phone | string | |
| is_primary | boolean | One primary per BP |

---

### `quote`
| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| quote_number | string | Prefix: QUO- |
| business_partner_id | FK → business_partner | |
| contact_id | FK → contact | Optional |
| status | enum | draft, sent, accepted, converted, declined, expired |
| valid_until | date | |
| total | decimal | Sum of line items |
| created_by | FK → user | |
| created_at | timestamp | |
| converted_to_so_id | FK → sales_order | Null until converted |

---

### `sales_order`
| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| so_number | string | Prefix: SO- or WEB- |
| source | enum | manual, web_store, converted_quote |
| business_partner_id | FK → business_partner | |
| status | enum | draft, pending_approval, confirmed, in_production, ready_to_ship, delivered, cancelled |
| requested_delivery_date | date | |
| total | decimal | |
| web_store_order_ref | string | Null for non-Web Store orders |
| created_by | FK → user | Null for auto-created Web Store SOs |
| created_at | timestamp | |

---

### `so_line_item` / `quote_line_item`
| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| parent_id | FK → sales_order or quote | |
| item_id | FK → item | |
| description | string | Overrideable description |
| quantity | decimal | |
| unit_price | decimal | From price list; overrideable |
| discount_pct | decimal | 0–100 |
| line_total | decimal | Computed: qty × unit_price × (1 − discount) |

---

### `item`
| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| item_code | string | SKU; unique |
| item_name | string | |
| item_type | enum | product, raw_material, service |
| unit_of_measure | string | e.g., each, sheet, roll |
| default_price | decimal | |
| cost | decimal | |
| on_hand_qty | decimal | |
| committed_qty | decimal | Reserved for open SOs |
| reorder_point | decimal | |
| web_store_published | boolean | |
| is_active | boolean | |

---

### `delivery`
| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| delivery_number | string | Prefix: DEL- |
| sales_order_id | FK → sales_order | |
| status | enum | draft, shipped, delivered |
| ship_date | date | |
| tracking_number | string | |
| carrier | string | |
| created_by | FK → user | |

---

### `ar_invoice`
| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| invoice_number | string | Prefix: INV- |
| delivery_id | FK → delivery | |
| business_partner_id | FK → business_partner | |
| status | enum | draft, sent, partially_paid, paid, overdue, void |
| issue_date | date | |
| due_date | date | |
| total | decimal | |
| balance | decimal | Total minus payments applied |
| gl_account_id | FK → gl_account | AR control account |

---

### `incoming_payment`
| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| ar_invoice_id | FK → ar_invoice | |
| amount | decimal | |
| payment_date | date | |
| payment_method | enum | check, ach, credit_card, wire, other |
| reference | string | Check number, transaction ID, etc. |
| posted_by | FK → user | |
| posted_at | timestamp | Immutable after posting |

---

### `job`
| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| job_number | string | Prefix: JOB- |
| sales_order_id | FK → sales_order | |
| status | enum | new, prepress, printing, finishing, ready_to_ship, shipped, on_hold, cancelled |
| assigned_to | FK → user | Optional; production operator |
| due_date | date | From SO requested delivery date |
| created_at | timestamp | |

---

### `content_asset`
| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| filename | string | Original filename |
| storage_key | string | Object storage path (e.g., S3 key) |
| thumbnail_key | string | Object storage path for web preview |
| file_type | string | png, jpg, svg, ai, psd, pdf, etc. |
| file_size_bytes | integer | |
| category | enum | photography, illustration, vector_logo, template, background |
| client_bp_id | FK → business_partner | Null = stock / G54-owned |
| usage_rights | enum | client_owned, licensed_stock, g54_owned, royalty_free |
| ai_description | text | AI-generated one-sentence description |
| ai_embedding | vector | For NLP similarity search (pgvector) |
| uploaded_by | FK → user | |
| uploaded_at | timestamp | |

---

### `asset_tag`
| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| asset_id | FK → content_asset | |
| tag | string | |
| source | enum | ai_generated, manual | |

---

### `collection`
| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| name | string | |
| created_by | FK → user | |

---

### `audit_log`
| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| user_id | FK → user | Who made the change |
| action | enum | create, update, delete, login, logout, approve, reject |
| module | string | e.g., sales, crm, content_library |
| record_type | string | e.g., sales_order, business_partner |
| record_id | string | |
| old_value | jsonb | Null for creates |
| new_value | jsonb | Null for deletes |
| timestamp | timestamp | Immutable |

---

## Key Relationships Summary

| Relationship | Type | Notes |
|---|---|---|
| business_partner → account_group | Many-to-one | Each BP has one Account Group |
| business_partner → contact | One-to-many | Multiple contacts per BP |
| quote → sales_order | One-to-one | Optional; via conversion |
| sales_order → job | One-to-one | Auto-created on SO confirmation |
| sales_order → delivery | One-to-one | Created when job is complete |
| delivery → ar_invoice | One-to-one | Created from delivery |
| ar_invoice → incoming_payment | One-to-many | Multiple partial payments possible |
| content_asset → job | Many-to-many | Via job_artwork join table |
| content_asset → collection | Many-to-many | Via asset_collection_member join table |
| user → role | Many-to-many | Users can hold multiple roles |

---

## Implemented tables (as built)

The sections above are the conceptual model. The live Drizzle schema
(`platform/src/db/schema.ts`) realizes them with clean names; the tables added
for the quoting calculator and Accounts Receivable are:

### Quoting calculator (migration 0026)

- `catalog_styles` — blank garments (brand, style #, base sell price, size class, optional supplier cost).
- `catalog_colors` — colors per style, tagged to a color tier (drives dark-garment underbase).
- `decoration_methods` — Silk Screen / DTF / Foil / Softhand / Embroidery; `pricing` jsonb holds setup-per-color (new/reorder), flat setup, run-per-color, dark upcharge; `price_mode` = per_color | stitch.
- `print_locations`, `color_tiers`, `embroidery_tiers` (stitch → price), `size_classes` (sizes + per-size upcharge).
- `quote_lines` extended with `style_id`, `color`, `color_tier`, `size_breakdown` (jsonb), `decorations` (jsonb). Priced server-side by `priceGarmentLine`; decorations flow into `order_spec_items` on conversion.

### Accounts Receivable (migration 0027)

- `invoices` — realizes `ar_invoice` (invoice_number INV- series, bp_id, order_id, status draft/sent/partial/paid/void, issue/due dates, terms, subtotal/discount/total, void fields).
- `invoice_lines` — line items on an invoice.
- `payments` — realizes `incoming_payment` (bp_id, invoice_id nullable = on-account, method, amount, received_date). Applied payments and voids keep `business_partners.account_balance` current.

### Reporting / order fields (migration 0025)

- `orders` gained `order_type`, `po_number`, `ship_via`, `date_type`, `due_date`, `amount`, `sales_rep_id`; `business_partners` gained `territory` and credit fields (`credit_hold`, `credit_hold_reason`, `personal_guarantee`, `price_list`, `softgood_price_level`, `shipping_type`, `customer_since`, `parent_bp_number`, `historical_apa`, `two_year_apa`).
