// End-user Help content for MakeReady by G54.
// Articles are grouped by section and rendered by /help and /help/[slug].
// Images live in /public/help/<name>.png and are referenced by filename only.

export type HelpBlock =
  | { k: "p"; text: string }
  | { k: "h"; text: string }
  | { k: "steps"; items: HelpStep[] }
  | { k: "img"; src: string; caption?: string }
  | { k: "tip"; text: string }
  | { k: "warn"; text: string }
  | { k: "list"; items: string[] };

export interface HelpStep {
  text: string;
  img?: string;
  caption?: string;
}

export interface HelpArticle {
  slug: string;
  title: string;
  section: string;
  summary: string;
  who?: string;
  blocks: HelpBlock[];
  related?: string[];
}

export const HELP_SECTIONS = [
  "Getting Started",
  "Account & Security",
  "CRM",
  "Sales",
  "Scheduling",
  "Administration",
] as const;

export const HELP_ARTICLES: HelpArticle[] = [
  // ─────────────────────────────── Getting Started ───────────────────────────
  {
    slug: "signing-in",
    title: "Signing in",
    section: "Getting Started",
    summary: "How to sign in, what happens on your first login, and what to do if you're locked out or forget your password.",
    who: "Everyone",
    blocks: [
      { k: "p", text: "MakeReady is a secure workspace — every person has their own account. You sign in with your email and password, and (if enabled for you) a second factor such as an authenticator code or passkey." },
      { k: "h", text: "Sign in" },
      {
        k: "steps",
        items: [
          { text: "Go to the sign-in page and enter your Email and Password.", img: "login.png", caption: "The MakeReady sign-in page." },
          { text: "Optionally tick \"Remember me\" to stay signed in for 30 days on this device (otherwise your session lasts about an hour of inactivity)." },
          { text: "Click \"Sign in\". If two-factor is set up on your account, you'll be asked to confirm it before you reach your dashboard." },
        ],
      },
      { k: "tip", text: "Only one device stays signed in at a time. Signing in somewhere new automatically signs you out everywhere else." },
      { k: "h", text: "Your first login" },
      { k: "p", text: "New accounts are created without a password. You'll receive a welcome email with a secure link to set one — the link expires in one hour. After you set it, and any time an administrator requires it, you'll land on the \"Update your password\" screen and must choose a new password before continuing. Passwords need at least 10 characters, with an uppercase letter, a lowercase letter, and a number." },
      { k: "h", text: "Forgot your password" },
      {
        k: "steps",
        items: [
          { text: "On the sign-in page click \"Forgot password?\".", img: "forgot.png", caption: "Request a reset link." },
          { text: "Enter your email and click \"Send reset link\". For security we always show the same confirmation, whether or not the address is on file." },
          { text: "Open the emailed link (valid for one hour), set a new password, and sign in again. Resetting your password signs out all of your other sessions." },
        ],
      },
      { k: "h", text: "If you're locked out" },
      { k: "p", text: "After five failed sign-in attempts your account locks for 15 minutes and administrators are notified. The lock clears on its own after 15 minutes, or immediately if you reset your password. There's no self-service unlock button — wait it out or reset." },
      { k: "warn", text: "For your security, MakeReady never reveals whether an email address has an account. A wrong email and a wrong password produce the same message." },
    ],
    related: ["two-factor-authentication", "dashboard"],
  },
  {
    slug: "dashboard",
    title: "Your dashboard & finding your way around",
    section: "Getting Started",
    summary: "A tour of the dashboard, the sidebar menu, collapsible sub-menus, and the top bar.",
    who: "Everyone",
    blocks: [
      { k: "p", text: "After signing in you land on your dashboard. What you see is tailored to your role — the modules you can open, the stats that matter to you, and your own open tasks." },
      { k: "img", src: "dashboard.png", caption: "The dashboard greets you by name and summarizes what needs attention." },
      { k: "h", text: "The sidebar" },
      { k: "p", text: "The left sidebar lists the modules you have access to. Some are collapsible groups — click a heading to expand it:" },
      {
        k: "list",
        items: [
          "CRM → Business Partners, Pipeline",
          "Sales → Quotes, Orders, Automations, Calendar",
          "Administration (admins only) → Users, Account Groups, Order Templates, Configuration, Audit Log",
        ],
      },
      { k: "p", text: "The active page is highlighted, and its parent group opens automatically. Items marked \"Soon\" are planned modules that aren't live yet." },
      { k: "h", text: "The top bar" },
      { k: "p", text: "Top-right you'll find the Notifications bell (with an unread badge), your initials avatar (which opens Account Security), and Sign out. Your name and roles are shown at the bottom of the sidebar." },
    ],
    related: ["signing-in", "notifications", "two-factor-authentication"],
  },
  {
    slug: "notifications",
    title: "Notifications",
    section: "Getting Started",
    summary: "Where alerts appear — new leads, meetings, locked accounts, automation activity — and how to clear them.",
    who: "Everyone",
    blocks: [
      { k: "p", text: "MakeReady keeps you posted with in-app notifications: a new web lead to assign, a meeting booked on your calendar, an account lockout (for admins), automation activity, and more." },
      {
        k: "steps",
        items: [
          { text: "Click the Notifications bell in the top bar. A red badge shows how many are unread.", img: "notifications.png", caption: "Your notifications, newest first." },
          { text: "Unread items are shaded with a red dot. Click \"Mark all read\" to clear the badge." },
        ],
      },
      { k: "tip", text: "The list shows your 100 most recent notifications. Many of them link straight to the relevant record — a lead, a meeting, or the users page." },
    ],
    related: ["dashboard"],
  },

  // ─────────────────────────────── Account & Security ────────────────────────
  {
    slug: "two-factor-authentication",
    title: "Two-factor authentication & passkeys",
    section: "Account & Security",
    summary: "Protect your account with an authenticator app, passkeys / security keys, and recovery codes.",
    who: "Everyone",
    blocks: [
      { k: "p", text: "Two-factor authentication (2FA) adds a second check at sign-in so a stolen password isn't enough to get in. Open it from your initials avatar in the top-right, or go to Account Security." },
      { k: "img", src: "security.png", caption: "The Security page. A banner shows whether 2FA is on." },
      { k: "h", text: "Authenticator app (TOTP)" },
      {
        k: "steps",
        items: [
          { text: "Click \"Set up authenticator app\"." },
          { text: "Scan the QR code with Google Authenticator, 1Password, Authy, or similar (or copy the manual key if you can't scan)." },
          { text: "Enter the 6-digit code and click \"Verify & enable\". You'll see \"✓ Authenticator app enabled\"." },
        ],
      },
      { k: "h", text: "Passkeys & security keys (FIDO2 / WebAuthn)" },
      {
        k: "steps",
        items: [
          { text: "Type a name for the device (e.g. \"MacBook\" or \"YubiKey\") in the \"Device name\" field." },
          { text: "Click \"Add passkey\" and complete your device's Face ID / Touch ID / security-key prompt." },
          { text: "The passkey now appears in your list. Remove any you no longer use with \"Remove\"." },
        ],
      },
      { k: "tip", text: "Passkeys are the fastest and most phishing-resistant option — at sign-in just choose \"Use a passkey / security key\" and confirm with your device." },
      { k: "h", text: "Recovery codes" },
      { k: "p", text: "Recovery codes let you get in if you lose your authenticator and passkeys. Click \"Generate recovery codes\", then save them somewhere safe (or \"Download .txt\"). Each code works once, and they're shown only at generation time. Regenerating replaces the old set." },
      { k: "warn", text: "If your organization requires 2FA, you'll be sent to this page and can't use the rest of the app until you enroll at least one method." },
    ],
    related: ["signing-in", "setting-your-availability"],
  },

  // ─────────────────────────────── CRM ───────────────────────────────────────
  {
    slug: "business-partners",
    title: "Browsing Business Partners",
    section: "CRM",
    summary: "Find customers, leads, and prospects; filter by stage; search; and understand the columns.",
    who: "Admin, Sales Manager, Sales Rep (own accounts), Finance (view)",
    blocks: [
      { k: "p", text: "Business Partners are the heart of CRM — every customer, lead, and prospect. They anchor quotes, orders, and (in later phases) invoices and Web Store access. Open CRM → Business Partners." },
      { k: "img", src: "crm-list.png", caption: "The Business Partners list with stage filters and search." },
      { k: "h", text: "Filter and search" },
      {
        k: "list",
        items: [
          "Stage pills — \"All\", \"Leads\", \"Prospects\", \"Customers\" — narrow the list by lifecycle stage.",
          "\"My accounts\" limits the list to accounts you own (managers/admins only; Sales Reps are always limited to their own).",
          "The search box matches on company name — type and press Enter.",
        ],
      },
      { k: "p", text: "Columns show the BP number, company (click to open), stage, owner, account group, and location. Click any company to open its record." },
      { k: "tip", text: "Search matches company names, not BP numbers. Use the stage pills to quickly triage your pipeline." },
    ],
    related: ["creating-a-business-partner", "managing-an-account", "pipeline"],
  },
  {
    slug: "creating-a-business-partner",
    title: "Creating a Business Partner",
    section: "CRM",
    summary: "Add a new customer or lead, set the owner, tags, and optionally send a financial application.",
    who: "Admin, Sales Manager, Sales Rep",
    blocks: [
      { k: "p", text: "From the Business Partners list, click \"New Business Partner\"." },
      { k: "img", src: "crm-new.png", caption: "The new Business Partner form." },
      {
        k: "steps",
        items: [
          { text: "Under \"Account\", enter the Company name and choose a Stage (Lead, Prospect, or Customer) and a Lead source." },
          { text: "Pick an Account group (this drives pricing tier and Web Store catalog) and an Owner. Sales Reps automatically own what they create, so the Owner field is hidden for them." },
          { text: "Add comma-separated Tags if useful (e.g. \"VIP, screen-print\")." },
          { text: "Optionally choose a financial application to send — \"Terms / Credit Application\" or \"Credit Card Application\" — and a secure request is created automatically on save." },
          { text: "Fill in the Primary contact (name and email are required) and an Address. Finance-capable roles also see optional Terms fields (credit limit, payment terms, internal notes)." },
          { text: "Click \"Create Business Partner\". A BP number is assigned and you're taken to the new record." },
        ],
      },
      { k: "tip", text: "If a company with the same name already exists you'll get a soft warning. Tick \"Create anyway\" and resubmit if it really is a different account." },
      { k: "warn", text: "You need at least one Account Group before you can create a Business Partner. Admins set these up in Administration → Account Groups." },
    ],
    related: ["business-partners", "managing-an-account", "account-groups", "financial-intake-documents"],
  },
  {
    slug: "managing-an-account",
    title: "Managing an account",
    section: "CRM",
    summary: "The account detail page: stage & owner, contacts, addresses, tasks, and the immutable activity log.",
    who: "Admin, Sales Manager, Sales Rep (own accounts), Finance (view)",
    blocks: [
      { k: "p", text: "Opening a Business Partner shows everything about the account on one page." },
      { k: "img", src: "crm-detail.png", caption: "A Business Partner record." },
      { k: "h", text: "Stage & owner" },
      { k: "p", text: "Use the quick buttons in the stage bar (e.g. \"→ Prospect\") to move the account through its lifecycle, and set the Owner from the dropdown. Every change is recorded automatically." },
      { k: "h", text: "Account details" },
      { k: "p", text: "Edit company info, address, tags, and (for finance roles) credit limit and payment terms inline, then \"Save changes\". Sales Reps never see finance fields, and can't accidentally blank them out." },
      { k: "h", text: "Tasks & follow-ups" },
      { k: "p", text: "Add a follow-up with a title, due date, and assignee, then check it off when done. Overdue open tasks are flagged in red and also surface on your dashboard." },
      { k: "h", text: "Activity log" },
      { k: "p", text: "Log notes, calls, emails, and visits. The log also records every change to the account automatically — stage moves, edits, document requests, quote and order activity — so you always have the full history." },
      { k: "warn", text: "The activity log is append-only. Entries can't be edited or deleted — it's your audit trail for the account." },
      { k: "h", text: "Contacts & addresses" },
      { k: "p", text: "Manage multiple contacts (one marked Primary) and shipping/billing addresses in the right-hand cards. The primary contact can't be removed — reassign primary first." },
      { k: "tip", text: "If the account's owner has a booking link set up, a \"📅 Book a meeting\" link appears so you can schedule with them in one click." },
    ],
    related: ["business-partners", "pipeline", "financial-intake-documents", "building-a-quote"],
  },
  {
    slug: "pipeline",
    title: "Working the pipeline",
    section: "CRM",
    summary: "Move accounts through Lead → Prospect → Customer on a Kanban board.",
    who: "Admin, Sales Manager, Sales Rep (own accounts)",
    blocks: [
      { k: "p", text: "The Pipeline gives you a Kanban view of your accounts by stage. Open CRM → Pipeline (or \"Pipeline\" from the Business Partners list)." },
      { k: "img", src: "pipeline.png", caption: "Leads, Prospects, and Customers as columns." },
      {
        k: "steps",
        items: [
          { text: "Each card shows the company, owner, lead source, and tags. Click a company to open the full record." },
          { text: "Use the arrows on a card — e.g. \"→ Prospect\" or \"← Lead\" — to move it between stages. The move is instant and logged to the account's activity history." },
        ],
      },
      { k: "tip", text: "Sales Reps see only their own accounts here; managers and admins see everyone's." },
    ],
    related: ["business-partners", "managing-an-account"],
  },
  {
    slug: "financial-intake-documents",
    title: "Secure financial intake documents",
    section: "CRM",
    summary: "Send customers a secure link to complete a Terms/Credit or Credit Card application — no sensitive data by email.",
    who: "Admin, Sales Manager, Sales Rep",
    blocks: [
      { k: "p", text: "When onboarding a customer you often need a signed credit application. MakeReady sends a secure link the customer fills in themselves — nothing sensitive travels by email." },
      { k: "h", text: "Request a document" },
      {
        k: "steps",
        items: [
          { text: "On the account page, find the \"Financial documents\" card. Choose the document type — \"Terms / Credit Application (Net 30)\" or \"Credit Card Application\" — and click \"Request document\"." },
          { text: "Copy the secure link, or click \"✉ Email link\" to open a prefilled email. The request shows as \"Awaiting customer\" until they submit." },
        ],
      },
      { k: "h", text: "What the customer sees" },
      { k: "p", text: "The customer opens the link (no login needed), completes the form, types their name to sign, agrees to the terms, and submits." },
      { k: "img", src: "apply.png", caption: "The customer-facing secure application page." },
      { k: "h", text: "Reviewing a submission" },
      { k: "p", text: "Once submitted the row shows \"Completed\" with a \"View submission\" link, and the account's activity log records who signed and when." },
      { k: "warn", text: "Credit card numbers are never collected in the app. The Credit Card Application directs customers to contact stacie@g54.com to provide card details out-of-band. A 3% processing fee applies to card transactions." },
    ],
    related: ["creating-a-business-partner", "managing-an-account"],
  },
  {
    slug: "capturing-web-leads",
    title: "Capturing web leads",
    section: "CRM",
    summary: "The public \"Request a quote\" form that turns website visitors into CRM leads.",
    who: "Public form; leads land with Sales Managers",
    blocks: [
      { k: "p", text: "MakeReady includes a public lead-capture form you can link from the website or an email signature. Visitors describe their project and become a CRM lead automatically." },
      { k: "img", src: "lead.png", caption: "The public \"Request a quote\" form." },
      { k: "p", text: "On submit, a new Business Partner is created as a Lead (source \"Website\") with the contact and message attached, and all Sales Managers are notified to assign an owner. From there, work it like any other account." },
      { k: "tip", text: "The form has spam protection built in, so bot submissions are silently discarded." },
    ],
    related: ["business-partners", "pipeline"],
  },

  // ─────────────────────────────── Sales ─────────────────────────────────────
  {
    slug: "building-a-quote",
    title: "Building a quote",
    section: "Sales",
    summary: "Create a quote from a product template, add line items and charges, and let pricing calculate automatically.",
    who: "Admin, Sales Manager, Sales Rep",
    blocks: [
      { k: "p", text: "Quotes are built from product templates, so pricing, setup charges, and markup are consistent. Open Sales → Quotes and click \"New quote\"." },
      {
        k: "steps",
        items: [
          { text: "Choose a Customer (optional — you can quote a walk-in) and a Product template, then click \"Create & open builder\".", img: "quote-new.png", caption: "Start a quote by picking a template." },
          { text: "In the builder, click \"+ Add line\" for each item. Pick a catalog item to auto-fill its price, or type a custom description. Set the quantity and unit price.", img: "quote-builder.png", caption: "The Quote Builder with line items, charges, and a live total." },
          { text: "Under \"Charges & setup\", tick the charges that apply (setup, decoration, rush, etc.). Some ask for a quantity, like number of colors or hours." },
          { text: "Tick \"Reorder\" if this is a repeat job — new-only setup charges drop off automatically." },
          { text: "Add any Notes, set a Discount if needed, and click \"Save quote\"." },
        ],
      },
      { k: "h", text: "How pricing works" },
      {
        k: "list",
        items: [
          "Each line = quantity × unit price.",
          "Catalog prices come from supplier cost plus a markup percentage set on the template.",
          "Charges can be flat, per-unit, per-color, per-hour, or a percentage of the subtotal, and can apply always, to new orders only, or to reorders only.",
          "Total = subtotal + charges − discount.",
        ],
      },
      { k: "tip", text: "The server always recalculates the money when you save, so the totals are authoritative — you can't accidentally save a bad number." },
    ],
    related: ["editing-and-emailing-a-quote", "order-templates", "orders-and-production-stages"],
  },
  {
    slug: "editing-and-emailing-a-quote",
    title: "Editing & emailing a quote",
    section: "Sales",
    summary: "Reopen a saved quote, attach a customer, move it through its statuses, and email it — logged to CRM history.",
    who: "Admin, Sales Manager, Sales Rep",
    blocks: [
      { k: "p", text: "Open any quote from Sales → Quotes to keep working on it. You can attach or change the customer, edit lines and charges, and email it out." },
      { k: "img", src: "quote-builder.png", caption: "A saved quote with status controls and the email button." },
      { k: "h", text: "Attach a customer" },
      { k: "p", text: "If you quoted a walk-in, use the \"Customer (Business Partner)\" dropdown and \"Save customer\" to link it. Linking a customer is what lets MakeReady log the quote to their CRM history." },
      { k: "h", text: "Statuses" },
      { k: "p", text: "Move the quote along with the status buttons: Draft → \"Mark sent\" → \"Accepted\" / \"Rejected\". An accepted quote can be converted to an order. Emailing a draft automatically marks it sent." },
      { k: "h", text: "Email to customer" },
      {
        k: "steps",
        items: [
          { text: "Click \"✉ Email to customer\". MakeReady opens your email app with a message pre-filled — subject \"G54 Sales Quote <number>\", the full quote in the body, and the customer's contact as the recipient." },
          { text: "Review and send from your own email app. The quote is logged to the customer's CRM activity as \"emailed\"." },
        ],
      },
      { k: "tip", text: "Both \"quote created\" and \"quote emailed\" appear in the customer's activity log — but only when a customer is attached to the quote." },
    ],
    related: ["building-a-quote", "orders-and-production-stages"],
  },
  {
    slug: "orders-and-production-stages",
    title: "Orders & production stages",
    section: "Sales",
    summary: "Convert a quote to an order, advance it through production stages, and generate the sales-order PDF.",
    who: "Admin, Sales Manager, Sales Rep",
    blocks: [
      { k: "p", text: "When a quote is accepted, convert it into a trackable order. On the quote, click \"Convert to order\" — this creates the order once, with its own number and a customer tracking link." },
      { k: "img", src: "order-detail.png", caption: "An order with its progress tracker, stage controls, and PDF tools." },
      { k: "h", text: "Production details & artwork" },
      { k: "p", text: "After the order is created, capture exactly what the customer wants made. The \"Production details\" section works for apparel and non-apparel alike — tees, hats, cups, and promo items." },
      {
        k: "steps",
        items: [
          { text: "Set an In-hands date and any special instructions (shipping, packaging, folding, individual bagging, deadlines).", img: "order-production.png", caption: "Production details and attachments on an order." },
          { text: "Add an item for each product. Each captures the product, decoration method (screen print, embroidery, DTG, pad print, laser engraving, and more), placement, colors and color count, and a size/quantity breakdown (e.g. \"S:50 M:100 L:75\", or \"One size: 100\" for hats/cups)." },
          { text: "Under \"Attachments\", upload art files, mockups, and reference photos (images, PDF, AI, EPS, PSD — up to 15 MB each). Images preview inline; label each as Art, Mockup, or Reference." },
        ],
      },
      { k: "tip", text: "Production details and item specs are included on the generated sales-order PDF, so the shop floor gets everything in one document." },
      { k: "h", text: "Advancing stages" },
      { k: "p", text: "Orders move through six stages: Order Received → Art & Proof → In Production → Quality Check → Shipped → Delivered. Under \"Update stage\", click the stage the order has reached. Each change is timestamped on the tracker and logged to the customer's history." },
      { k: "h", text: "The sales-order PDF" },
      {
        k: "steps",
        items: [
          { text: "Click \"Generate & email PDF\". MakeReady builds a sales-order PDF from the quote, saves it to the order, and emails it to the customer." },
          { text: "Use \"Regenerate & resend PDF\" if the customer didn't receive it or details changed. Each generated PDF is kept on the order and can be downloaded." },
        ],
      },
      { k: "tip", text: "Stages aren't locked to a fixed order — you can jump ahead or step back if something changes in the shop." },
      { k: "warn", text: "The PDF email is sent by MakeReady's mail provider. Until email delivery is fully configured, sends show as \"queued\" — the PDF is still saved and downloadable in the meantime." },
    ],
    related: ["building-a-quote", "customer-order-tracker"],
  },
  {
    slug: "customer-order-tracker",
    title: "The customer order tracker",
    section: "Sales",
    summary: "A public, login-free page where customers follow their order like a pizza tracker.",
    who: "Customer-facing (shareable link)",
    blocks: [
      { k: "p", text: "Every order has a shareable tracking link — no login required — so customers can follow progress in real time." },
      { k: "img", src: "track.png", caption: "The customer-facing order tracker." },
      {
        k: "steps",
        items: [
          { text: "On the order page, find the \"Customer tracker link\" card. Click \"Copy\", or \"✉ Email link to customer\" to send it in a prefilled message." },
          { text: "The customer sees a friendly status page that updates each time you advance a stage, with the current step highlighted and timestamps for completed steps." },
        ],
      },
      { k: "tip", text: "Times on the tracker display in Mountain Time, matching the shop." },
    ],
    related: ["orders-and-production-stages"],
  },
  {
    slug: "sales-automations",
    title: "Sales automations (drip campaigns)",
    section: "Sales",
    summary: "Build timed sequences that create tasks, notify owners, and email customers automatically.",
    who: "Admin, Sales Manager (Sales Reps can view)",
    blocks: [
      { k: "p", text: "Automations keep leads warm without manual reminders. A campaign is a timed sequence of steps that runs after a lead is enrolled. Open Sales → Automations." },
      { k: "img", src: "automations.png", caption: "The automations list." },
      { k: "h", text: "Create a campaign" },
      {
        k: "steps",
        items: [
          { text: "Under \"New drip campaign\", give it a name and choose a Trigger: \"When a lead is created\" (auto-enrolls new leads) or \"Manual enrollment only\". Click \"Create campaign\"." },
          { text: "On the campaign page, add steps. Each step fires a set number of days after enrollment.", img: "automation-detail.png", caption: "Adding timed steps to a campaign." },
          { text: "For each step choose a Day offset and an action: Create task, Notify owner, or Email customer (use {company} in the email body to insert the customer's name)." },
          { text: "Tick \"Active\" so the campaign runs, and \"Save campaign\"." },
        ],
      },
      { k: "tip", text: "New leads (including web leads) auto-enroll in any active \"When a lead is created\" campaign. The scheduler runs once daily, so multi-step campaigns advance one step per day." },
      { k: "warn", text: "Customer emails from automations send through the mail provider and show as \"queued\" until email delivery is fully configured. Tasks and owner notifications work immediately." },
    ],
    related: ["capturing-web-leads", "pipeline"],
  },

  // ─────────────────────────────── Scheduling ────────────────────────────────
  {
    slug: "setting-your-availability",
    title: "Setting your availability",
    section: "Scheduling",
    summary: "Create your booking link, set your hours, and control notice and slot length — Calendly-style.",
    who: "Everyone with a booking link",
    blocks: [
      { k: "p", text: "Set up a personal booking link so customers can schedule time with you. From Account Security, click \"Scheduling →\", or go to Account → Scheduling." },
      { k: "img", src: "scheduling-setup.png", caption: "Your scheduling settings and weekly availability." },
      {
        k: "steps",
        items: [
          { text: "Under \"Booking settings\", set your link slug (your public URL becomes /schedule/<slug>), your timezone, minimum notice, slot interval, and how far ahead people can book. Tick \"Accept public bookings\" and \"Save booking settings\"." },
          { text: "Under \"Weekly availability\", tick each working day and set a start and end time, then \"Save availability\". One window per day." },
          { text: "Copy your booking link from \"Your booking link\" and share it." },
        ],
      },
      { k: "tip", text: "Times shown to customers are in your timezone, and slots respect your notice period, existing meetings, and booking window automatically." },
    ],
    related: ["customer-booking-page", "team-calendar"],
  },
  {
    slug: "customer-booking-page",
    title: "The customer booking page",
    section: "Scheduling",
    summary: "What customers see when they book: choosing a meeting type, picking a slot, and confirming.",
    who: "Customer-facing (shareable link)",
    blocks: [
      { k: "p", text: "Your booking link opens a clean, public page where customers pick a meeting and a time — no login needed." },
      { k: "img", src: "schedule.png", caption: "The public booking page with meeting types and open times." },
      {
        k: "steps",
        items: [
          { text: "The customer chooses a meeting type (each shows its length), then picks an open time slot from your available days." },
          { text: "They enter their name (required) and optionally email, phone, and a note, then click \"Confirm booking\"." },
          { text: "They see a confirmation, and you get a notification and a new entry on the team calendar." },
        ],
      },
      { k: "tip", text: "If a slot gets taken between selecting and confirming, the customer is asked to pick another — double-bookings are prevented." },
    ],
    related: ["setting-your-availability", "team-calendar", "managing-a-meeting"],
  },
  {
    slug: "team-calendar",
    title: "The team calendar",
    section: "Scheduling",
    summary: "A month-grid calendar of all scheduled meetings, color-coded by type and filterable by host.",
    who: "Admin, Sales Manager, Sales Rep, Finance/Production (view)",
    blocks: [
      { k: "p", text: "The team calendar shows every scheduled meeting in a month grid. Open Sales → Calendar." },
      { k: "img", src: "calendar.png", caption: "The month calendar with per-appointment cards." },
      {
        k: "list",
        items: [
          "Each appointment is a card showing the time, meeting type, attendee, and host — color-coded by meeting type.",
          "Use ← / → to change month, or \"Today\" to jump back.",
          "Filter with the host chips — \"Everyone\" or a specific person.",
          "Click any card to open the full meeting.",
        ],
      },
      { k: "tip", text: "Only scheduled meetings appear on the grid. Canceled and completed meetings drop off, but you can still open them from a direct link." },
    ],
    related: ["managing-a-meeting", "customer-booking-page"],
  },
  {
    slug: "managing-a-meeting",
    title: "Managing a meeting",
    section: "Scheduling",
    summary: "Open a meeting to see full details, mark it complete, cancel, or reschedule to a new open slot.",
    who: "Admin, Sales Manager, Sales Rep",
    blocks: [
      { k: "p", text: "Click any appointment on the calendar to open its detail page." },
      { k: "img", src: "meeting-detail.png", caption: "Full meeting detail with actions." },
      { k: "p", text: "You'll see the attendee (with clickable email and phone), the linked company, the host, notes, and how it was booked. From here you can:" },
      {
        k: "list",
        items: [
          "\"Mark complete\" once the meeting has happened.",
          "\"Cancel meeting\" — the host is notified.",
          "\"Reschedule\" — pick a new open slot and confirm.",
        ],
      },
      { k: "h", text: "Rescheduling" },
      {
        k: "steps",
        items: [
          { text: "Click \"Reschedule\" to see the host's open times.", img: "reschedule.png", caption: "Pick a new time from the host's availability." },
          { text: "Choose a new slot, then \"Confirm reschedule\". The old time is released and the host is notified." },
        ],
      },
      { k: "tip", text: "Reschedule slots respect the host's availability and existing meetings — the meeting's own current time is freed up so it never blocks itself." },
    ],
    related: ["team-calendar", "customer-booking-page"],
  },

  // ─────────────────────────────── Administration ────────────────────────────
  {
    slug: "users-and-roles",
    title: "Users & roles",
    section: "Administration",
    summary: "Invite users, assign roles, and understand what each role can do. Deactivate or delete accounts safely.",
    who: "Admin only",
    blocks: [
      { k: "p", text: "Administration is admin-only. Open Administration → Users to manage accounts." },
      { k: "img", src: "admin-users.png", caption: "The Users list with status and actions." },
      { k: "h", text: "Invite a user" },
      {
        k: "steps",
        items: [
          { text: "Under \"Add a user\", enter the person's full name and email, and tick at least one role.", img: "admin-user-edit.png", caption: "Editing a user's roles." },
          { text: "Click \"Create user & send invite\". They receive an email link to set their password (valid one hour) and must choose one on first sign-in." },
        ],
      },
      { k: "h", text: "The six roles" },
      {
        k: "list",
        items: [
          "Admin — full access to everything, including Administration.",
          "Sales Manager — full CRM & Sales, sees all accounts and finance fields.",
          "Sales Rep — edit CRM & Sales, but limited to their own accounts and can't see cost/margin or finance fields.",
          "Finance / Accounting — view CRM & Sales; full Accounting, Controlling, and Asset Accounting.",
          "Production — Inventory, Point of Sale, Jobs & Production, Quality, and Equipment Maintenance.",
          "Art Department — the Content Library plus a view of production jobs.",
        ],
      },
      { k: "p", text: "Roles are additive — assign several and the user gets the highest access each grants." },
      { k: "h", text: "Deactivate, delete, and force reset" },
      {
        k: "list",
        items: [
          "\"Deactivate\" blocks sign-in and ends the user's sessions immediately; \"Activate\" restores access.",
          "\"Delete\" is permanent and only available for already-inactive accounts.",
          "\"Force reset\" ends their sessions and requires a new password at next sign-in.",
        ],
      },
      { k: "warn", text: "Safety guards prevent you from locking everyone out: you can't deactivate or delete yourself, can't remove your own Admin role, and can't remove the last active admin." },
    ],
    related: ["account-groups", "system-configuration", "audit-log"],
  },
  {
    slug: "account-groups",
    title: "Account groups",
    section: "Administration",
    summary: "Define the pricing tiers / catalogs that Business Partners are assigned to.",
    who: "Admin only",
    blocks: [
      { k: "p", text: "Account groups control the pricing tier and Web Store catalog a Business Partner sees. At least one must exist before anyone can create a Business Partner. Open Administration → Account Groups." },
      { k: "img", src: "admin-groups.png", caption: "Account groups." },
      {
        k: "steps",
        items: [
          { text: "Under \"Add account group\", enter a short Code (e.g. WHOLESALE — it's stored uppercase) and a display Name (e.g. Wholesale)." },
          { text: "Click \"Add account group\". It's now selectable when creating or editing a Business Partner." },
        ],
      },
      { k: "tip", text: "Common groups are seeded for you: Standard, Wholesale, and Government." },
    ],
    related: ["creating-a-business-partner", "users-and-roles"],
  },
  {
    slug: "order-templates",
    title: "Order templates (the Template Builder)",
    section: "Administration",
    summary: "Create the product forms that power the Quote Builder — items, supplier cost + markup, and charge rules.",
    who: "Admin only",
    blocks: [
      { k: "p", text: "Order templates are the reusable product forms behind every quote. They define the item catalog, pricing (supplier cost + markup), and setup/decoration charges. Open Administration → Order Templates." },
      { k: "img", src: "admin-templates.png", caption: "The templates list." },
      { k: "h", text: "Create a template" },
      {
        k: "steps",
        items: [
          { text: "Under \"New order-form template\", enter a name (e.g. \"Softgoods (Apparel)\"), optional sizes, and a description. Click \"Create template\" to open the editor." },
          { text: "In \"Details\", set a Default markup % (applied over cost when an item has no markup of its own) and tick \"Active\" so it appears in the Quote Builder.", img: "admin-template-edit.png", caption: "The template editor: details, charge rules, and item catalog." },
          { text: "Under \"Charge rules\", add setup/decoration/rush charges. Pick a type (flat, per-unit, per-color, per-hour, or percent), a rate, and when it applies (always, new only, or reorder only)." },
          { text: "Under \"Item catalog\", add items with a supplier cost and a markup % (leave markup blank to inherit the template default). The sell price is computed for you." },
        ],
      },
      { k: "h", text: "How the price is set" },
      { k: "p", text: "Sell price = supplier cost × (1 + markup %). Markup is a percentage over cost, not a margin. Changing the default markup or an item's values recalculates the affected prices automatically." },
      { k: "tip", text: "Only Active templates show up in the Quote Builder. Vendor cost feeds can replace manual costs in a later phase." },
    ],
    related: ["building-a-quote"],
  },
  {
    slug: "system-configuration",
    title: "System configuration",
    section: "Administration",
    summary: "Company details, timezone, session timeout, the require-MFA policy, and document numbering.",
    who: "Admin only",
    blocks: [
      { k: "p", text: "Open Administration → Configuration to manage organization-wide settings." },
      { k: "img", src: "admin-config.png", caption: "System configuration." },
      { k: "h", text: "Company & system" },
      {
        k: "list",
        items: [
          "Company name and legal name.",
          "Timezone (IANA, e.g. America/Denver) — used across the app for displaying times.",
          "Fiscal year start month.",
          "Session timeout in minutes (5–1440) — how long an idle session lasts.",
          "\"Require two-factor authentication\" — when on, every user must enroll a second factor before using the app.",
        ],
      },
      { k: "p", text: "Click \"Save configuration\" to apply. Changes are recorded in the audit log." },
      { k: "h", text: "Document number series" },
      { k: "p", text: "The read-only \"Document number series\" table shows the prefixes and next numbers for Business Partners, quotes, sales orders, deliveries, invoices, and payments (e.g. QUO-, SO-). These auto-increment as documents are created." },
      { k: "warn", text: "Turning on \"Require two-factor authentication\" will immediately push every user without 2FA to the Security page until they enroll — make sure your own account has a method first." },
    ],
    related: ["two-factor-authentication", "audit-log"],
  },
  {
    slug: "audit-log",
    title: "The audit log",
    section: "Administration",
    summary: "An append-only record of every change, filterable and exportable to CSV for compliance.",
    who: "Admin only",
    blocks: [
      { k: "p", text: "Every meaningful action in MakeReady is recorded in the audit log — sign-ins, user changes, configuration edits, template changes, and more. Open Administration → Audit Log." },
      { k: "img", src: "admin-audit.png", caption: "The audit log with filters and CSV export." },
      {
        k: "steps",
        items: [
          { text: "Filter by date range and by actor (a specific user, or \"System\" for automated actions), then click \"Search\"." },
          { text: "Click \"Export CSV\" to download the filtered results (with timestamps, actor, entity, IP, and details) for your records." },
        ],
      },
      { k: "warn", text: "The log is append-only and retained at least 13 months for PCI DSS / SOC 2. Entries can't be edited or deleted — even deleting a user leaves their past events in place (the actor simply shows as \"System\")." },
    ],
    related: ["users-and-roles", "system-configuration"],
  },
];

export function articlesBySection(): { section: string; articles: HelpArticle[] }[] {
  return HELP_SECTIONS.map((section) => ({
    section,
    articles: HELP_ARTICLES.filter((a) => a.section === section),
  })).filter((g) => g.articles.length > 0);
}

export function getArticle(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.slug === slug);
}
