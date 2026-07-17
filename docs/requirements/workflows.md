# Workflows & Approvals

**Wireframe:** https://g54-platform.vercel.app/workflows.html
**Epic refs:** 9.1–9.6
**Stakeholders (Operations/Process):** Britney de Jong, Tyson Johnson

---

## Overview

The Workflows & Approvals module allows MakeReady to route documents and events through configurable approval chains. Rules fire automatically based on conditions (dollar amount, role, document type) and notify the appropriate approvers. This replaces manual email-based approval processes.

---

## User Stories

### US-WF-01: Web Store order approval
**As a** Sales Manager  
**I want** Web Store orders above a threshold to be held for my review  
**So that** G54 doesn't commit to large orders without management sign-off

**Acceptance Criteria:**
- Given a Web Store order total is ≥ $5,000, when the order is received, then the Sales Order is created in "Pending Approval" status
- Given a Pending Approval SO exists, then the Sales Manager receives an in-app notification (and email, if configured)
- Given I approve the SO, then it moves to Confirmed and enters the production queue immediately
- Given I reject the SO with a reason, then the SO is cancelled and the reason is logged
- The $5,000 threshold must be configurable in Administration by an Admin without a code change

---

### US-WF-02: Credit limit override approval
**As a** Finance member  
**I want** Sales Orders that exceed a customer's credit limit to require Finance approval  
**So that** we don't extend credit beyond approved limits

**Acceptance Criteria:**
- Given a Sales Order is created for a BP whose open balance + SO total exceeds their credit limit, then the SO is flagged and Finance is notified
- Given Finance approves the override, then the SO proceeds normally with the override logged
- Given Finance rejects the override, then the Sales Rep is notified and the SO is held

---

### US-WF-03: Artwork approval routing
**As an** Art Department lead  
**I want** jobs requiring artwork approval to route through the Art Department before printing  
**So that** artwork is signed off before production resources are committed

**Acceptance Criteria:**
- Given a job has artwork attached and is in Prepress status, when the prepress step is marked complete, then the Art Department lead is notified for approval
- Given the artwork is approved, then the job advances to Printing status
- Given the artwork is rejected (with notes), then the job status reverts to New and the assigned Sales Rep is notified

---

### US-WF-04: Approval notifications
**As an** approver  
**I want to** receive notifications when items need my approval  
**So that** I can act quickly and not create bottlenecks

**Acceptance Criteria:**
- Given an approval is routed to me, then I receive an in-app notification immediately
- Given email notifications are enabled for my account, then I also receive an email with a direct link to the item
- Given I have pending approvals, then the Dashboard shows a badge count of pending items

---

### US-WF-05: Approval audit trail
**As an** Admin or Finance member  
**I want to** see the full history of approvals on any document  
**So that** there is a clear record of who approved what and when

**Acceptance Criteria:**
- Given a document has gone through any approval step, then its record shows: approver name, decision (Approved / Rejected), timestamp, and any notes
- The approval history is immutable and cannot be edited or deleted

---

## Workflow Rules (Initial Configuration)

The following rules are configured on initial deployment. Additional rules can be added by Admins.

| Rule ID | Trigger | Condition | Action | Approver |
|---|---|---|---|---|
| WF-001 | Web Store order received | Total ≥ $5,000 | Hold SO as Pending Approval | Sales Manager |
| WF-002 | Sales Order created | BP credit limit exceeded | Hold SO, notify Finance | Finance role |
| WF-003 | Job in Prepress — marked complete | Artwork attached | Route artwork for approval | Art Department lead |
| WF-004 | Sales quote created | Discount > 10% | Flag for Sales Manager review | Sales Manager |

*Additional rules to be defined during Operations/Process discovery with Britney de Jong and Tyson Johnson.*
