# RBAC — Roles, Permissions & Authentication

**Wireframe:** https://g54-platform.vercel.app/auth.html
**Epic refs:** 1.1, 1.2, 1.3, 3.7 (field sales)

---

## Roles

| Role | Description | Typical Users |
|---|---|---|
| **Admin** | Full system access including configuration, user management, and all data | Christopher Wall |
| **Sales Manager** | Full visibility into all sales, CRM, and Web Store; can approve orders; can view (not edit) finance | [TBD] |
| **Sales Rep** | Field and office sales; access scoped to customer-facing and sales modules; can upload orders and artwork from field | Britney de Jong, Leslie Weiler, Cody de Jong |
| **Finance/Accounting** | Full access to all finance modules; read-only access to sales for invoice context | Kim Lund |
| **Production** | Full access to jobs, inventory, quality, and maintenance; no access to finance or CRM | Tyson Johnson |
| **Art Department** | Full access to Content Library; access to jobs limited to artwork-related tasks; no access to finance or customer data | Tyson Johnson + art staff |

> A user may hold more than one role (e.g., Tyson Johnson holds both Production and Art Department).

---

## Permission Matrix

Legend: **Full** = create + edit + delete + configure | **Edit** = create + edit (no delete) | **View** = read-only | **Own** = own records only | **—** = no access

| Module | Admin | Sales Manager | Sales Rep | Finance | Production | Art Dept |
|---|---|---|---|---|---|---|
| Dashboard | Full | View (sales KPIs) | View (own pipeline) | View (finance KPIs) | View (production KPIs) | View (library stats) |
| CRM | Full | Full | Edit (own accounts) | View | — | — |
| Sales | Full | Full | Edit (own orders) | View | View | — |
| Web Store | Full | Full | View | View | — | — |
| Accounting | Full | — | — | Full | — | — |
| Controlling | Full | — | — | Full | — | — |
| Asset Accounting | Full | — | — | Full | — | — |
| Inventory & MRP | Full | View | — | View | Full | — |
| Point of Sale | Full | View | — | — | View | — |
| Jobs & Production | Full | View | — | — | Full | View (artwork tasks only) |
| Quality Management | Full | — | — | — | Full | — |
| Equipment Maintenance | Full | — | — | — | Full | — |
| Content Library | Full | View | Edit (client assets, own uploads) | — | View | Full |
| Workflows & Approvals | Full | View + Approve | — | View + Approve (finance rules) | — | — |
| Reports | Full | View (sales + production) | View (own performance) | View (finance + sales) | View (production) | View (library) |
| Administration | Full | — | — | — | — | — |

---

## Field-Level Restrictions (Sales Rep role)

Sales Reps have access to CRM and Sales, but the following fields are hidden or read-only:

| Module | Restricted Field | Restriction |
|---|---|---|
| CRM | Credit Limit | Hidden |
| CRM | Account Balance | Hidden |
| CRM | Internal Notes (finance) | Hidden |
| Sales | Cost / Margin | Hidden |
| Sales | Discount > 10% | Requires Sales Manager approval |
| Sales | All other reps' orders | Hidden (own orders only) |
| Reports | Revenue by customer | Hidden (own customers only) |

---

## Authentication

### Login Flow
1. User navigates to MakeReady login screen
2. Enters email address and password
3. System validates credentials against user record
4. On success: session created, user redirected to role-appropriate dashboard
5. On failure: generic error message (do not reveal whether email exists)
6. After 5 failed attempts: account locked for 15 minutes; alert sent to Admin

### Session
- Session expires after **[TBD]** minutes of inactivity
- "Remember me" option extends session to 30 days
- Single active session per user (new login invalidates old session) **[TBD — confirm with client]**
- Logout clears session immediately

### Password Requirements
- Minimum 10 characters
- At least one uppercase, one lowercase, one number
- Password reset via email link (expires in 1 hour)
- Admin can force password reset on next login

### Field Sales Considerations
- Login must work on tablet / mobile browser without native app installation
- Session duration for Sales Reps should be extended (field reps may be in-vehicle without connectivity for periods) **[TBD]**
- Offline capability for order drafts is **[PHASE 2]**

---

## User Stories

### US-AUTH-01: Login
**As a** user  
**I want to** log in with my email and password  
**So that** I can access the modules relevant to my role

**Acceptance Criteria:**
- Given valid credentials, when I submit the login form, then I am redirected to my role-appropriate dashboard within 2 seconds
- Given invalid credentials, when I submit the login form, then I see a generic error and my password is not revealed in any response
- Given 5 consecutive failed attempts, when the 5th attempt fails, then my account is locked and Admin receives an alert
- Given a locked account, when I attempt to log in, then I see a message to contact my administrator

---

### US-AUTH-02: Role-based module access
**As a** user  
**I want to** see only the navigation items and data relevant to my role  
**So that** I am not confused by modules I cannot use and cannot accidentally access restricted data

**Acceptance Criteria:**
- Given I am a Sales Rep, when I log in, then the sidebar shows only: Dashboard, CRM, Sales, Web Store (view), Content Library; Finance modules are not visible
- Given I am Finance, when I log in, then I do not see CRM, Jobs, Inventory, or Administration
- Given I am Production, when I log in, then I do not see CRM, Sales, Accounting, or Administration
- Given I directly navigate to a URL for a module I don't have access to (e.g., /accounting.html), then I receive a 403 / access denied screen

---

### US-AUTH-03: Field sales order submission
**As a** Sales Rep in the field  
**I want to** log in from my tablet, create a sales order, and attach client artwork  
**So that** the order is in the system before I leave the client's location

**Acceptance Criteria:**
- Given I am a Sales Rep on a tablet browser, when I log in, then the interface is usable on a tablet without horizontal scrolling
- Given I am creating a sales order, when I search for a client BP, then results appear within 2 seconds
- Given I am creating a sales order, when I attach a file from my tablet's photo library or file system, then the file uploads and attaches to the order
- Given I submit a sales order, when submission succeeds, then I receive an on-screen confirmation with the new SO number

---

### US-AUTH-04: Password reset
**As a** user who has forgotten their password  
**I want to** reset my password via email  
**So that** I can regain access without contacting IT

**Acceptance Criteria:**
- Given I click "Forgot password" and enter my email, when I submit, then I receive a reset email within 2 minutes (or a confirmation message either way — do not reveal whether the email exists)
- Given I click the reset link in the email, when the link is less than 1 hour old, then I can set a new password
- Given I click the reset link in the email, when the link is more than 1 hour old, then I see an expiry message and can request a new link

---

### US-AUTH-05: Admin user management
**As an** Admin  
**I want to** create, edit, and deactivate user accounts and assign roles  
**So that** I can onboard new staff and remove access when someone leaves

**Acceptance Criteria:**
- Given I am an Admin, when I create a new user, then I can set their name, email, role(s), and whether they must reset their password on first login
- Given I deactivate a user, when the change is saved, then any active sessions for that user are immediately invalidated
- Given I assign a role to a user, when the change is saved, then the user's navigation and data access updates on their next page load
