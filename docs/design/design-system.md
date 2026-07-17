# Design System

**Live reference:** https://g54-platform.vercel.app (inspect any page)
**Source file:** `wireframes/styles.css` in the repository

The wireframes use a fully-implemented CSS design system. The production build should replicate these visual tokens and components. This document captures the decisions; `styles.css` is the authoritative source.

---

## Color Tokens

| Token | Value | Usage |
|---|---|---|
| `--primary` | `#6366f1` (indigo) | Primary actions, active states, links |
| `--primary-dark` | `#4f46e5` | Hover state for primary |
| `--primary-light` | `#ede9fe` | Light tint backgrounds, AI-related UI |
| `--success` | `#22c55e` | Positive status, published, paid |
| `--success-light` | `#dcfce7` | Success badge backgrounds |
| `--warning` | `#f59e0b` | Pending, attention states |
| `--warning-light` | `#fef9c3` | Warning badge backgrounds |
| `--danger` | `#ef4444` | Errors, overdue, cancelled |
| `--danger-light` | `#fee2e2` | Error badge backgrounds |
| `--neutral-900` | `#0f172a` | Primary text |
| `--neutral-700` | `#374151` | Secondary text |
| `--neutral-500` | `#64748b` | Muted text, labels |
| `--neutral-300` | `#e2e8f0` | Borders, dividers |
| `--neutral-100` | `#f8fafc` | Page background |
| `--white` | `#ffffff` | Card backgrounds |

---

## Typography

| Level | Size | Weight | Usage |
|---|---|---|---|
| Page title (h1) | 20px | 700 | Module heading |
| Page subtitle | 14px | 400 | Subheading below page title |
| Card title (h2) | 14px | 600 | Section headings inside cards |
| Table header | 11px | 700 | All-caps, letter-spaced |
| Body text | 14px | 400 | Default content |
| Small / meta | 12px | 400 | Timestamps, file sizes, secondary info |
| Badge / label | 10–11px | 600–700 | Status badges, tags |
| Font family | System UI stack | — | `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` |

---

## Layout

### Application Shell

```
┌─────────────────────────────────────────────────────────────┐
│ .app-layout (display: flex; height: 100vh; overflow: hidden) │
│                                                              │
│ ┌──────────┐  ┌────────────────────────────────────────────┐ │
│ │ .sidebar │  │ .main-wrapper (flex: 1)                    │ │
│ │ 240px    │  │                                            │ │
│ │          │  │ ┌─────────────────────── .topbar ────────┐ │ │
│ │          │  │ │ 56px height; breadcrumb + user chip    │ │ │
│ │          │  │ └────────────────────────────────────────┘ │ │
│ │          │  │                                            │ │
│ │          │  │ ┌──────── .main-content ─────────────────┐ │ │
│ │          │  │ │ flex: 1; overflow-y: auto; padding:24px│ │ │
│ │          │  │ │ Page content lives here                 │ │ │
│ │          │  │ └────────────────────────────────────────┘ │ │
│ └──────────┘  └────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Critical:** Use exactly these class names — `app-layout`, `main-wrapper`, `main-content`. Any other names break the layout silently.

### Sidebar
- Width: 240px, fixed, does not scroll with content
- Background: `#1e293b` (dark slate)
- Sections: `.sidebar-section` with `.sidebar-section-label` (all-caps, muted)
- Active link: `background: rgba(99,102,241,0.15); color: #6366f1; border-right: 3px solid #6366f1`
- Footer: `.sidebar-footer` — shows logged-in user initials and name

### Content Grid
- Cards use `.card > .card-header + .card-body` structure
- Stat tiles use `.stat-tile` with `.stat-value` and `.stat-label`
- Table rows use `.table-row` inside `.table-wrap`

---

## Components

### Buttons
```
.btn                          — base
.btn-primary                  — filled indigo (primary action)
.btn-secondary                — outline (secondary action)
.btn-sm                       — small variant (32px height)
```

### Status Badges
```
.badge                        — base
.badge-success (green)        — Paid, Published, Active, Shipped
.badge-warning (amber)        — Pending, Draft, In Progress
.badge-danger (red)           — Overdue, Cancelled, Error
.badge-info (blue)            — New, Submitted
.badge-neutral (gray)         — Inactive, Archived
```

### Tabs
```html
<div class="tabs">
  <button class="tab active" data-tab="tab-id">Tab Label</button>
  ...
</div>
<div class="tab-panel active" id="tab-tab-id"> ... </div>
```
JavaScript: see any wireframe page — tabs toggle `.active` class on panels.

### Forms
```
.form-group                   — wrapper for label + input
.form-label                   — 12px, 600 weight, neutral-700
.form-control                 — input, select, textarea (full width, 36px height for inputs)
```

### Toggle Switches
```
.toggle-track.on              — indigo background (enabled state)
.toggle-track (no .on)        — gray background (disabled state)
```

### Table
```html
<div class="table-wrap">
  <table>
    <thead><tr><th>...</th></tr></thead>
    <tbody><tr class="table-row"><td>...</td></tr></tbody>
  </table>
</div>
```

### Avatar / Initials
```
.avatar                       — 32px circle, indigo background, white text
```
Usage: `<div class="avatar">CW</div>` (first letters of name)

---

## AI / NLP Search UI Patterns

The Content Library introduces a distinct visual language for AI-powered features:

- **AI search bar:** 2px indigo border, 4px indigo glow shadow, `AI SEARCH` pill badge (indigo, 10px 800 weight)
- **AI interpretation banner:** gradient background (`#ede9fe` → `#e0f2fe`), indigo border, robot icon, interpreted-query tags in `#ddd6fe` (purple-light)
- **Auto-tag badges:** `background: #ede9fe; color: #5b21b6` — distinct from manual tags (`background: #f1f5f9; color: #475569`)
- **Match badges:**
  - High match: `background: #dcfce7; color: #15803d`
  - Medium match: `background: #fef9c3; color: #92400e`
  - Low match: `background: #f1f5f9; color: #64748b`

---

## Wireframe-to-Production Notes

1. The wireframes use `emoji` for icons throughout (sidebar, cards, badges). Production should replace with an icon library (e.g., Lucide, Heroicons) — emoji are not suitable for production UI.
2. All data in wireframes is static mock data. Real data will come from the API.
3. Sidebar navigation visibility should be driven by user role (server-rendered or client-side role check on load).
4. Wireframe pages use plain `<script>` tags for tab interactivity. Production should use the frontend framework's component model instead.
5. `styles.css` is ~1,400 lines of flat CSS. Production should migrate these tokens to CSS custom properties or a Tailwind config for theming consistency.
