# Administration

**Wireframe:** https://g54-platform.vercel.app/admin.html
**Epic refs:** 1.3–1.6
**Stakeholders:** Christopher Wall (Admin)

---

## Overview

The Administration module is accessible only to users with the Admin role. It provides system-wide configuration including user management, system settings, integration settings, and the audit log.

---

## User Stories

### US-ADMIN-01: User management
**As an** Admin  
**I want to** create, edit, and deactivate user accounts  
**So that** access is provisioned when staff join and revoked when they leave

**Acceptance Criteria:**
- Given I create a user, then I set: full name, email, role(s), and whether to send a welcome email with set-password link
- Given I deactivate a user, then all active sessions for that user are invalidated immediately
- Given I view the user list, then I see each user's name, email, role(s), last login date, and active/inactive status

Active users (as of initial deployment):

| Name | Email | Phone | Role(s) |
|---|---|---|---|
| Christopher Wall | [TBD] | [TBD] | Admin |
| Kim Lund | kim@g54.com | 480-292-6226 | Sales Manager, Finance |
| Chase de Jong | chase@g54.com | 385-315-2670 | Sales Manager |
| Britney de Jong | britney@g54.com | 801-520-1073 | Finance/Accounting |
| Leslie Weiler | leslie@g54.com | 801-558-0778 | Sales Rep |
| Tyson Johnson | tyson@g54.com | 801-318-5803 | Production, Art Department |
| Cody de Jong | cody@g54.com | 801-560-6702 | Sales Rep |

---

### US-ADMIN-02: System configuration
**As an** Admin  
**I want to** configure global system settings  
**So that** MakeReady is tailored to G54's specific business setup

**Acceptance Criteria:**
- Configurable settings include: company name (G54 / Great Mountain West), fiscal year start month, default currency (USD), document number prefixes (QUO-, SO-, WEB-, INV-, DEL-, JOB-), session timeout duration
- Given I change a document prefix, then the new prefix applies to all new documents (existing documents are unaffected)

---

### US-ADMIN-03: Integration settings
**As an** Admin  
**I want to** configure and monitor external integrations  
**So that** Web Store and other connections remain healthy

**Acceptance Criteria:**
- Given I am on the Integration Settings page, then I see the status of:
  - Web Store (store.g54.com) — connection status, last sync, order count
  - SAP B1 Migration — progress indicator, open items remaining
  - AI Service (Anthropic Claude API) — API key config, call count, last successful call
- Given an integration is unhealthy, then it shows a red status indicator and last error message
- Given I update an API key, when I save, then the new key is used for all subsequent calls

---

### US-ADMIN-04: Audit Log
**As an** Admin  
**I want to** view a complete, immutable log of all system changes  
**So that** I can investigate issues and demonstrate compliance

**Acceptance Criteria:**
- Given any user creates, edits, or deletes a record, then an audit entry is written: user name, action, record type, record ID, timestamp, old value, new value
- Given I view the audit log, then I can filter by: date range, user, module, and action type
- Audit entries cannot be deleted by any user (including Admin)
- Audit log must be exportable to CSV
