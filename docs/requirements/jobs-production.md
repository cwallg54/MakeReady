# Jobs & Production

**Wireframe:** https://g54-platform.vercel.app/jobs.html
**Epic refs:** 5.1–5.4, 5.7, 5.8
**Stakeholders (Operations/Production):** Tyson Johnson, Cody (Production readiness)

---

## Overview

The Jobs & Production module is the production floor's view of MakeReady. Every Sales Order generates a Job (Work Order) automatically. Jobs move through a defined status pipeline from receipt to shipping. The Art Department attaches approved artwork to jobs, and Production tracks progress.

---

## Job Status Pipeline

```
New → Prepress → Press Check → Printing → Finishing → Ready to Ship → Shipped
                     │                                               └─► Triggers Delivery in Sales
                     └─► (gate) full run blocked until Art signs off on the first-article proof
```

Jobs can also be: On Hold | Cancelled

**Press Check gate.** For jobs flagged **Press check required** (see US-SALES for the order-level flag; typically all new silk-screen jobs), the job cannot advance from Press Check to Printing until Art has approved the first-article proof (US-JOB-07). Jobs not flagged for a press check skip the gate and move Prepress → Printing directly. Reorders default to *no press check* unless the customer or the artwork changed.

---

## User Stories

### US-JOB-01: Auto-create job from Sales Order
**As a** Production member  
**I want** a job to be created automatically when a Sales Order is confirmed  
**So that** I don't have to manually enter job details that are already in the SO

**Acceptance Criteria:**
- Given a Sales Order moves to Confirmed status, within 30 seconds, then a corresponding Job is created in the production queue
- Given the Job is created, then it contains: Job number (prefix JOB-), linked SO number, customer name, line items with quantities, and due date (derived from SO requested delivery date)
- Given the Job is created, then its initial status is New
- Given a Web Store SO is created, then its job follows the same auto-creation rule

---

### US-JOB-02: View and manage the production queue
**As a** Production member  
**I want to** see all active jobs in a prioritized queue  
**So that** I know what to work on and in what order

**Acceptance Criteria:**
- Given I am on Jobs & Production, when I view the queue, then I see all jobs that are not in Shipped or Cancelled status
- Given the queue is shown, then each row shows: Job number, customer, description, status, assigned operator, due date, and any overdue indicator
- Given a job is past its due date, then it is visually flagged (e.g., red highlight)
- Given I filter by status, then only jobs in that status are shown

---

### US-JOB-03: Update job status
**As a** Production member  
**I want to** update a job's status as it moves through the production pipeline  
**So that** Sales and Management can see real-time production progress

**Acceptance Criteria:**
- Given I am on a Job record, when I change the status, then the change is saved with my name and timestamp
- Given a Job moves to Shipped status, then a Delivery document is automatically triggered (or a prompt to create one is shown) in the Sales module
- Given a job is in any status, when I add a note, then the note appears in the job's activity log

---

### US-JOB-04: Attach artwork to a job
**As an** Art Department member  
**I want to** attach approved artwork files to a job  
**So that** Production has the correct files and doesn't have to search for them

**Acceptance Criteria:**
- Given I am on a Job record, when I click "Attach Artwork," then I can either:
  (a) Search and select an asset from the Content Library, or
  (b) Upload a new file (which is simultaneously added to the Content Library with the job's client auto-assigned)
- Given an asset is attached from the Content Library, then the job shows: thumbnail preview, filename, and file type
- Given I attach a file by upload, then the file is stored in the Content Library and linked to the job
- Given Production views the job, when they click the artwork thumbnail, then the file opens in a viewer or downloads

---

### US-JOB-05: Job notes and activity
**As any** team member with Jobs access  
**I want to** add notes to a job  
**So that** the full history of decisions and communications about a job is in one place

**Acceptance Criteria:**
- Given I add a note to a job, then it shows: note text, my name, and timestamp
- Given a note is saved, then it cannot be edited or deleted (immutable log)
- Given I am a Sales Rep viewing a job linked to my SO, then I can see the job status and notes but cannot change them

---

### US-JOB-06: Job linked to Sales Order (navigation)
**As a** Sales Manager  
**I want to** navigate from a Sales Order directly to its corresponding Job  
**So that** I can answer customer questions about production status without leaving the sales view

**Acceptance Criteria:**
- Given I am on a Sales Order record, when I click the linked Job number, then I navigate to the Job record
- Given I am on a Job record, when I click the linked SO number, then I navigate back to the Sales Order

---

### US-JOB-07: First-article proof (press check) sign-off
**As a** Production member
**I want to** capture a photo of the first printed item and get Art's sign-off in-system before I run the rest of the order
**So that** we catch color/registration/placement errors on one garment instead of the whole run — without texting photos from personal cell phones

> **Replaces today's manual process.** Today Production prints one item, photographs it on their **personal cell phone**, and **texts it to someone in Art** to confirm it looks right before running the full order. That handoff lives outside any system — no record of who approved, when, or against which proof. This story moves the entire loop in-system so it is logged, tied to the job, and auditable.

**Acceptance Criteria:**
- Given a job is flagged **Press check required**, when it reaches the **Press Check** stage, then Production cannot advance it to **Printing** until a first-article proof has been approved
- Given I am on a Job at the Press Check stage, when I tap **Capture first-article proof**, then I can take or upload a photo directly from a phone/tablet camera (iOS + Android) and it attaches to the job
- Given I submit the first-article photo, then a **press-check review** notification is routed to the Art Department (the artist who owns the design, if known), and the job shows status "Awaiting press-check approval"
- Given an Art member opens the press-check review, then they see side-by-side: the **approved customer proof / artwork** and the **first-article photo**, plus job number, customer, design number, and print locations
- Given an Art member reviews the first-article, when they click **Approve**, then the job is released to **Printing** and the approval is logged with reviewer name, timestamp, and the photo compared
- Given an Art member clicks **Reject / needs changes**, then they must enter a reason, the job stays at Press Check, Production is notified, and they can capture a new first-article photo (each attempt is retained as a version)
- Given the press check is complete, then the full history (each photo, each decision, each reviewer, timestamps) is visible on the job and cannot be edited or deleted
- **[V2]** Given the Art reviewer is out of the app, then the press-check request can also be delivered via SMS with a secure link to approve/reject (ties to the platform SMS notification track)

**Open questions / definitions (TBD with Cody + Tyson):**
- Which job types always require a press check vs. never (default: new silk-screen = yes; reorders with unchanged art = no; embroidery = TBD)
- Whether more than one Art approver is acceptable, or it must be the design's owning artist
- Whether a rejected press check should also alert the Sales rep / Production lead
