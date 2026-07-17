# Technical Architecture

**Status:** Decisions marked [TBD] require client/dev firm input before build begins.

---

## System Overview

MakeReady is a web application — a single-tenant, multi-role SaaS platform deployed for G54/Great Mountain West. It is accessible from any modern browser without a native app install requirement. The production URL will be determined during setup; wireframes are currently hosted at https://g54-platform.vercel.app.

---

## Hosting & Deployment

| Layer | Decision | Notes |
|---|---|---|
| Cloud provider | [TBD] | AWS, Azure, or GCP — US-based region required |
| Application hosting | [TBD] | Options: Vercel (current wireframe host), AWS Elastic Beanstalk, Azure App Service |
| Database hosting | [TBD] | Managed PostgreSQL preferred (AWS RDS, Azure Database, Neon) |
| File storage (DAM) | [TBD] | AWS S3, Azure Blob Storage, or GCS — for Content Library uploads |
| CDN | [TBD] | For static assets and file storage access |
| Production domain | [TBD] | e.g., app.makeready.g54.com |
| Web Store domain | store.g54.com | Replaces greatmountainwest.zoey.com |

---

## Tech Stack

| Layer | Options Under Consideration | Notes |
|---|---|---|
| Frontend | Next.js (React), or Remix | SSR for performance; component-based for reuse |
| Backend | Node.js + tRPC, or Next.js API routes, or .NET 8 | [TBD — dev firm recommendation] |
| Database | PostgreSQL | Relational; required for financial data integrity |
| ORM | Prisma or Drizzle (if JS/TS stack) | [TBD] |
| Auth | Clerk, Auth0, or custom JWT | See RBAC requirements |
| File storage | AWS S3 or Azure Blob | 500 MB max per file; auto-thumbnail generation on upload |
| AI / Vision API | Anthropic Claude (recommended) | For Content Library NLP search and auto-tagging |
| Vector search | pgvector (Postgres extension) or Pinecone | For NLP similarity search in Content Library |
| Email | [TBD] | Transactional email for notifications, approvals, password reset (e.g., Resend, SendGrid, AWS SES) |
| PDF generation | [TBD] | For quote/invoice PDFs (e.g., Puppeteer, React-PDF, or server-side rendering) |

---

## Application Modules (Backend Services)

Each module may be implemented as a domain within a monolith or as separate services. For the initial build, **a well-structured monolith is recommended** — it is simpler to operate and MakeReady's modules are highly interdependent.

| Domain | Key Responsibilities |
|---|---|
| Auth | Login, session, password reset, role enforcement |
| Customers | Business Partners, Contacts, Account Groups |
| Sales | Quotes, Sales Orders, Deliveries, AR Invoices, Incoming Payments |
| Web Store | Storefront catalog, order intake, status sync |
| Production | Jobs, status pipeline, artwork links |
| Inventory | Item Master, stock levels, Web Store publish |
| Finance | Chart of Accounts, AP, GL, bank reconciliation |
| Controlling | Cost Centers, Budgets |
| Asset Accounting | Fixed Assets, Depreciation |
| Content Library | Upload, AI tagging, search, collections |
| Workflows | Rule engine, approval routing, notifications |
| Reports | Aggregated queries, exports |
| Administration | User management, system config, audit log |

---

## Key Architectural Constraints

1. **No middleware / iPaaS** — All integrations are direct. No Vision33 Saltbox or equivalent.
2. **Web Store is native** — store.g54.com is served by MakeReady, not a third-party eCommerce platform.
3. **Single database** — All modules share one PostgreSQL instance; no separate data stores per module (monolith data model).
4. **Financial data integrity** — Posted financial transactions (invoices, payments, journal entries) must be immutable. Updates happen via reversal entries, not record edits.
5. **Audit logging** — Every write operation is logged in a separate audit table. This cannot be disabled.
6. **US data residency** — All data stored in US-based cloud regions.
7. **Responsive web** — Must be usable on a tablet (768px minimum width) for field sales use. Native mobile app is Phase 2.

---

## Security Requirements

| Requirement | Detail |
|---|---|
| Authentication | Passwords hashed with bcrypt (or equivalent cost-appropriate algorithm) |
| Authorization | Server-side role enforcement on every API endpoint — never trust client-side role claims |
| API security | All API endpoints require authenticated session; no unauthenticated data access |
| Secrets management | API keys and credentials stored in environment variables / secrets manager (never hardcoded) |
| HTTPS | All traffic over TLS; HTTP redirects to HTTPS |
| Input validation | Validate and sanitize all user inputs on the server |
| File upload security | Validate MIME types and file headers on upload; scan for malware [TBD — requirement to confirm] |
| Session management | Secure, HTTP-only cookies; CSRF protection on state-changing endpoints |

---

## Content Library — Technical Detail

The AI-powered search pipeline:

```
Upload
  └─► Store file in object storage
  └─► Generate thumbnail (server-side)
  └─► Send image to Claude Vision API
        └─► Receive tags + description
        └─► Generate embedding (vector) of description
        └─► Store in pgvector index
        └─► Asset is now searchable

NLP Search Query ("find moose national parks graphics")
  └─► Send query text to embedding model
  └─► Vector similarity search in pgvector
  └─► Rank results by cosine similarity score
  └─► Return top N results with relevance scores
```

This means the quality of NLP search results depends on the quality of AI-generated descriptions. The system must generate descriptions that capture: subjects, setting, style, color palette, and mood — not just generic labels.

---

## SAP Business One Migration Architecture

See [integrations.md](integrations.md) for the full migration plan. The architectural pattern:

1. SAP B1 exports master data and open transactions to structured CSV/Excel files
2. Migration scripts transform and validate the data
3. Scripts load data into MakeReady via the admin API or direct DB inserts
4. Cutover date: G54 runs both systems in parallel for [TBD] weeks, then decommissions SAP B1
