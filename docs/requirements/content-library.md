# Content Library — Digital Asset Management

**Wireframe:** https://g54-platform.vercel.app/library.html
**Epic refs:** 8.1–8.12
**Stakeholders (Art):** Cody de Jong (Requests/Schedule, Library), Jon [TBD last name] (Library)

---

## Overview

The Content Library is MakeReady's Digital Asset Management (DAM) module. It gives G54's Art Department a single place to store, organize, and retrieve every piece of artwork, graphic, and creative file — with AI-powered search so anyone can find assets in plain English without knowing filenames or folder paths.

The defining capability is **natural language search**: a user can type "find all graphics that feature a moose and look like they could fit into a national parks theme" and receive ranked, relevant results based on visual content analysis — not just filename matching.

---

## User Stories

### US-LIB-01: Upload an asset
**As an** Art Department member  
**I want to** upload graphic files to the Content Library  
**So that** they are centrally stored, findable, and linked to jobs

**Acceptance Criteria:**
- Given I am on the Upload tab, when I drag files onto the drop zone or click to browse, then files begin uploading immediately
- Given a file is uploading, when upload completes, then AI auto-tagging begins automatically (within 5 seconds)
- Given AI tagging is complete, then the asset appears in the Library grid with auto-generated tags visible
- Given I upload a file larger than 500 MB, when I attempt to drop it, then I receive a clear error before upload begins
- Supported formats: PNG, JPG, JPEG, WEBP, TIFF, SVG, EPS, AI, PSD, INDD, PDF
- Given I upload a PSD, AI, or INDD file, then a web-preview thumbnail is auto-generated from the first artboard/layer

---

### US-LIB-02: AI auto-tagging on upload
**As an** Art Department member  
**I want** uploaded assets to be automatically tagged with descriptive labels  
**So that** assets are searchable immediately without manual tagging effort

**Acceptance Criteria:**
- Given an image is uploaded, when AI analysis is complete (within 60 seconds), then the asset has at least 3 auto-generated tags describing its visual content
- Given AI-generated tags, when I view the asset, then auto-tags are visually distinguished from manual tags (e.g., different color or "AI" indicator)
- Given AI analysis, then tags capture: primary subjects (animals, objects, people), setting/location, color palette, style/aesthetic (rustic, modern, minimalist, etc.), and mood
- Given AI analysis, then a one-sentence description of the asset is generated and stored (used in NLP search)
- Given AI analysis fails (API error), then the asset is still uploaded successfully and flagged for manual tagging

---

### US-LIB-03: Natural language search
**As any** MakeReady user with Content Library access  
**I want to** search for assets using plain English descriptions  
**So that** I can find relevant artwork without knowing filenames or tags

**Acceptance Criteria:**
- Given I type a natural language query (e.g., "find all graphics that feature a moose and look like they could fit into a national parks theme"), when I submit, then results appear within 10 seconds
- Given results are returned, then they are ranked by visual relevance to the query (not alphabetically or by upload date)
- Given results are returned, then each result shows: thumbnail, filename, match relevance (High / Medium / Low with percentage), and the matching tags
- Given the AI interprets my query, then a summary of what the AI searched for is shown (e.g., "Searched for: wildlife featuring moose or elk · national parks / outdoor aesthetic · rustic color palette")
- Given no results match, then I see a clear no-results message and suggested alternative queries
- Given a query that matches both auto-tags and manual tags, then both contribute to relevance ranking

---

### US-LIB-04: Standard keyword/filter search
**As any** MakeReady user with Content Library access  
**I want to** filter assets by file type, category, client, and tag  
**So that** I can narrow results when I know specific attributes

**Acceptance Criteria:**
- Given I select a file type filter (e.g., SVG only), then results immediately update to show only that type
- Given I select a client filter, then only assets assigned to that client are shown
- Given I select multiple filters, then results must match ALL selected filters
- Given I clear all filters, then the full library is restored

---

### US-LIB-05: Visual similarity search
**As an** Art Department member  
**I want to** select an existing asset and find visually similar assets  
**So that** I can find variations or related pieces for a project without describing them in words

**Acceptance Criteria:**
- Given I am viewing an asset, when I click "Find Similar," then results show assets with similar visual composition, color palette, and subject matter
- Given similarity results are shown, then they are ranked by similarity score
- Given similarity results, then I can filter by file type or client as usual

---

### US-LIB-06: Manual tagging and editing
**As an** Art Department member  
**I want to** add, edit, and remove tags on any asset  
**So that** I can correct AI errors and add context the AI may have missed

**Acceptance Criteria:**
- Given I am viewing an asset, when I click to edit tags, then I can type to add new tags (comma-separated)
- Given I remove a tag, when I save, then the tag is removed from search indexes immediately
- Given I edit a tag, when I save, then search results update to reflect the change within 30 seconds
- Auto-generated AI tags can be removed but are labeled so it is clear they were AI-generated

---

### US-LIB-07: Collections
**As an** Art Department member  
**I want to** organize assets into named collections (e.g., by client, theme, or campaign)  
**So that** related assets are grouped for easy access

**Acceptance Criteria:**
- Given I create a collection, when I name it and save, then it appears in the Collections tab
- Given I am viewing an asset, when I click "Add to Collection," then I can select one or more collections
- Given I view a collection, then only assets in that collection are shown
- Given I delete a collection, then the assets in it are NOT deleted — only the grouping is removed

---

### US-LIB-08: Client assignment and access control
**As an** Admin or Art Department member  
**I want to** assign assets to a specific client BP  
**So that** client-owned artwork is organized by account and access is controlled

**Acceptance Criteria:**
- Given I upload an asset, when I assign it to a client, then the asset is associated with that BP record
- Given I am a Sales Rep, when I browse the Content Library, then I only see assets assigned to my own clients (plus G54-owned stock)
- Given an asset is marked "Client-owned (restricted)," then it is not visible to users outside the assigned client's sales rep and the Art Department
- Given an asset is marked "G54 owned" or "Royalty-free," then it is visible to all users with Content Library access

---

### US-LIB-09: Usage rights management
**As an** Art Department member  
**I want to** tag each asset with its usage rights  
**So that** we never use licensed artwork in ways that violate terms

**Acceptance Criteria:**
- Given I am uploading or editing an asset, then I can set one of: Client-owned (restricted), Licensed stock (internal use only), G54 owned (unrestricted), Royalty-free (unlimited)
- Given an asset is "Licensed stock (internal use only)," when someone attempts to use it for a client job, then a warning is shown: "This is licensed for internal use only. Confirm this usage is permitted."
- Usage rights are visible on the asset card and in search results

---

### US-LIB-10: Job linking
**As a** Production or Art Department member  
**I want to** link a Content Library asset to an active job  
**So that** production has direct access to the correct artwork

**Acceptance Criteria:**
- Given I am viewing an asset in the library, when I click "Use in Job," then I can search for and select an active job
- Given I link an asset to a job, then the job record shows a link back to the asset
- Given I view a job in Jobs & Production, when I click the artwork thumbnail, then it opens the full-resolution asset or previewer

---

### US-LIB-11: Usage history
**As an** Art Department member  
**I want to** see which jobs have used a given asset  
**So that** I can track asset reuse and understand client history

**Acceptance Criteria:**
- Given I view an asset's detail, then I see a list of jobs it has been linked to, with job number, client, and date
- Given an asset has never been used in a job, then the usage history shows "Not used in any job yet"

---

## Technical Requirements

| Requirement | Detail |
|---|---|
| File storage | Cloud object storage (e.g., AWS S3, Azure Blob, GCS) — [TBD] |
| Max file size | 500 MB per file |
| Supported input formats | PNG, JPG, JPEG, WEBP, TIFF, SVG, EPS, AI (Illustrator), PSD (Photoshop), INDD (InDesign), PDF |
| Thumbnail generation | Auto-generate 400×300px web preview for all supported formats; use Ghostscript or equivalent for PDF/AI/EPS |
| AI tagging provider | Anthropic Claude API (vision) — recommended; must be configurable to swap provider |
| NLP search index | Vector embeddings stored per asset; similarity search via vector DB (e.g., pgvector, Pinecone) — [TBD] |
| Search latency | NLP search must return results in < 10 seconds for a library of up to 10,000 assets |
| Tag index update | Manual tag changes must propagate to search index within 30 seconds |
| Storage reporting | Admin and Art Department can see total storage used vs. quota |
