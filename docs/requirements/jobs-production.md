# Jobs & Production

**Wireframe:** https://g54-platform.vercel.app/jobs.html
**Epic refs:** 5.1–5.4
**Stakeholders (Operations/Production):** Tyson Johnson

---

## Overview

The Jobs & Production module is the production floor's view of MakeReady. Every Sales Order generates a Job (Work Order) automatically. Jobs move through a defined status pipeline from receipt to shipping. The Art Department attaches approved artwork to jobs, and Production tracks progress.

---

## Job Status Pipeline

```
New → Prepress → Printing → Finishing → Ready to Ship → Shipped
                                                        └─► Triggers Delivery in Sales
```

Jobs can also be: On Hold | Cancelled

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
