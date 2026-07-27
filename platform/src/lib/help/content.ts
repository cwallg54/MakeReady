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
  "Art & Production",
  "Inventory",
  "Reports & Analytics",
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
      { k: "p", text: "The sign-in, password-reset, and two-factor screens are also rate-limited by network address, so automated guessing is throttled before it ever reaches your account. Normal use never hits these limits; if you do see a \"too many attempts\" message, wait the stated time and try again." },
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
    related: ["signing-in", "notifications", "two-factor-authentication", "mobile-app"],
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

  {
    slug: "mobile-app",
    title: "MakeReady on your phone (field sales)",
    section: "Getting Started",
    summary: "Install MakeReady on your phone and use the field-sales view — bottom navigation, tap-to-call accounts, and quoting on the go.",
    who: "Field sales & everyone",
    blocks: [
      { k: "p", text: "MakeReady adapts to your phone with a streamlined field-sales view. Your desktop stays exactly the same — the phone just gets bigger touch targets, card lists instead of wide tables, and a bottom navigation bar." },
      { k: "h", text: "Install it to your home screen" },
      { k: "p", text: "Installing gives you a full-screen, app-like MakeReady you launch from your home screen (no browser bars). It's optional — everything works in the mobile browser too." },
      {
        k: "steps",
        items: [
          { text: "Open makeready.g54.com in your phone's browser and sign in." },
          { text: "iPhone (Safari): tap the Share button, then \"Add to Home Screen\"." },
          { text: "Android (Chrome): tap the ⋮ menu, then \"Install app\" (or \"Add to Home screen\")." },
          { text: "Launch MakeReady from the new navy \"M\" icon — it opens full screen." },
        ],
      },
      { k: "h", text: "Getting around" },
      { k: "p", text: "A bottom bar gives you one-tap access to the things you use in the field:" },
      {
        k: "list",
        items: [
          "Home — your dashboard and open tasks",
          "Accounts — your Business Partners (search and tap to open)",
          "＋ New — create something new (tap or press-and-hold for options)",
          "Quotes — your recent quotes",
          "Orders — your orders and their stage",
        ],
      },
      { k: "p", text: "You only see the tabs your role has access to." },
      { k: "tip", text: "Tap the center ＋ button — or press and hold it — to pop up quick actions: New Customer and New Quote. Press-and-hold gives a little buzz; tap either option, or tap outside to dismiss." },
      { k: "h", text: "Working an account" },
      { k: "p", text: "Open an account and you'll see a quick-action row at the top:" },
      {
        k: "list",
        items: [
          "📞 Call — dials the primary contact",
          "✉️ Email — opens a new email to the primary contact",
          "📝 Log — jumps to the activity log to record a note, call, or visit",
          "🧾 New Quote — starts a quote with this customer already filled in",
        ],
      },
      { k: "tip", text: "Call and Email use your phone's own dialer and mail app, so they work even to save the number to your contacts." },
      { k: "h", text: "Quoting on the go" },
      { k: "p", text: "The quote builder is touch-friendly on mobile: each line item is a card where you pick the product, size, and quantity, and the price fills in automatically — the same server-checked pricing as the desktop. Tap Save when you're done." },
      { k: "warn", text: "The pipeline board is drag-and-drop and works best on a larger screen; on a phone, use the Accounts list with the Lead / Prospect / Customer filters instead." },
    ],
    related: ["dashboard", "managing-an-account", "building-a-quote"],
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
      { k: "warn", text: "2FA is now required for every MakeReady user. On your next sign-in you'll be taken to this page and can't use the rest of the app until you enroll at least one method — an authenticator app or a passkey. Set one up now so you're not caught out mid-task." },
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
      { k: "warn", text: "2FA is required org-wide, so you'll be sent to this page and can't use the rest of the app until you enroll at least one method." },
      { k: "h", text: "Too many code attempts" },
      { k: "p", text: "For safety, MakeReady allows only a handful of code or recovery-code attempts per sign-in. If you exceed them, the pending sign-in is cancelled and you'll need to enter your password again before retrying. Repeated wrong passwords still lock the account for 15 minutes." },
    ],
    related: ["signing-in", "setting-your-availability", "security-and-data-protection"],
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
          "The filter bar lets you combine a company search, an owner, an account group, and a city/state — click \"Apply\" to run them, or \"Clear\" to reset.",
        ],
      },
      { k: "h", text: "Sort the columns" },
      { k: "p", text: "Click any column header — BP #, Company, Stage, Owner, Account group, or Location — to sort by it. Click again to flip between ascending (▲) and descending (▼). Your sort and filters are saved in the page URL, so you can bookmark or share a specific view." },
      { k: "tip", text: "Filters and sort combine. For example: Stage = Customers, Account group = Wholesale, sorted by Company Z→A — all shareable via the link." },
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
          { text: "Fill in the Primary contact (name and email are required) and an Address. Finance-capable roles also see the Terms section — a credit limit, internal notes, and Payment terms, which is a dropdown with two choices: Net 30 or Prepay (Credit Card)." },
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
      { k: "h", text: "Order history" },
      { k: "p", text: "The Order history card lists every order this customer has placed, newest first — order number (click through to the order), current stage, in-hands date, when it was placed, and its value. The header shows the lifetime order count and total spend. Voided orders are shown struck through and excluded from the totals." },
      { k: "tip", text: "Order history is pulled live from the database, so it always reflects the current state of each order — no separate report to run." },
      { k: "h", text: "Contacts & addresses" },
      { k: "p", text: "Manage multiple contacts (one marked Primary) and shipping/billing addresses in the right-hand cards. The primary contact can't be removed — reassign primary first." },
      { k: "tip", text: "If the account's owner has a booking link set up, a \"📅 Book a meeting\" link appears so you can schedule with them in one click." },
    ],
    related: ["business-partners", "pipeline", "financial-intake-documents", "building-a-quote", "reports-overview"],
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
          { text: "Choose a Customer and a Product template, then click \"Create & open builder\". The customer box is a search field — start typing a company name or BP number and pick from the results (leave it blank for a walk-in).", img: "quote-new.png", caption: "Start a quote by searching for the customer and picking a template." },
          { text: "In the builder, click \"+ Add line\" for each item. Pick a catalog item and set the quantity — for quantity-priced items (like caps) the unit price fills in automatically from the price band. For apparel, pick a Size and any size upcharge is added for you. Choose \"custom\" to type a free line and your own price.", img: "quote-builder.png", caption: "The Quote Builder: pick an item and quantity, and the unit price fills from the band." },
          { text: "Under \"Charges & setup\", tick the charges that apply (screen prep, decoration, rush, art, etc.). Some ask for a quantity, like number of colors or hours." },
          { text: "Tick \"Reorder\" if this is a repeat job — new-only setup charges (like new screen prep) drop off automatically." },
          { text: "Add any Notes, set a Discount if needed, and click \"Save quote\"." },
          { text: "Upload anything the customer provided during intake — logos, artwork, reference photos — under \"Customer artwork & reference images\". Pick the kind (Customer art / Reference / Mockup), choose the file, and click Upload.", img: "quote-attachments.png", caption: "Attach customer-provided art right on the quote — it carries to the order and the art department automatically." },
        ],
      },
      { k: "tip", text: "Images you attach here at the intake stage are copied onto the order when the quote is converted, so the art department has exactly what the customer sent — no re-uploading." },
      { k: "h", text: "How pricing works" },
      {
        k: "list",
        items: [
          "Each line = quantity × unit price.",
          "Quantity price bands: many items (e.g. caps) are priced by how many you order — 72 / 144 / 288 / 432 / 576 — and the unit price drops as the quantity rises. MakeReady picks the right band price for the quantity you enter.",
          "Size upcharges: apparel sizes like 2XL and 3XL add a set amount on top of the base price when you choose the size.",
          "Minimums: if an item has a minimum order quantity, a note warns you when you're under it.",
          "Charges can be flat, per-unit, per-color, per-hour, or a percentage of the subtotal, and can apply always, to new orders only, or to reorders only.",
          "Total = subtotal + charges − discount.",
        ],
      },
      { k: "tip", text: "For quantity-priced items the unit price is set automatically and is read-only — just like the grey \"Do Not Type\" formula cells on the old order forms. The server also recalculates every total when you save, so the numbers are always authoritative." },
    ],
    related: ["quoting-for-reps", "editing-and-emailing-a-quote", "order-templates", "orders-and-production-stages"],
  },
  {
    slug: "quoting-for-reps",
    title: "For reps: the order-form calculators, now in MakeReady",
    section: "Sales",
    summary: "If you've used the Excel order forms (Caps, Baja, Softgoods, Wood), here's how the exact same pricing works now — automatically — in the Quote Builder.",
    who: "Sales Rep, Sales Manager, Admin",
    blocks: [
      { k: "p", text: "For years the quote math lived in the Excel \"Master\" order forms — one file per product, with the grey \"Formulas – Do Not Type\" cells that filled in the unit price for you. MakeReady replaces all of those spreadsheets with a single Quote Builder. The same formulas now run inside the app, so you pick the product and quantity and the price fills itself in — no separate file, no hunting for the current price list." },
      { k: "h", text: "What's the same" },
      {
        k: "list",
        items: [
          "Caps are still priced by style and quantity band (72 / 144 / 288 / 432 / 576).",
          "Apparel still has size upcharges (e.g. 2XL and 3XL cost a bit more).",
          "Screen prep, decoration, art, and rush charges still apply — and still differ for New vs Reorder.",
          "Minimum quantities (like the Animal caps' 144 minimum) still apply.",
        ],
      },
      { k: "h", text: "What's different (better)" },
      {
        k: "list",
        items: [
          "One Quote Builder for every product — you pick a template (Caps, Baja, Softgoods, Wood) instead of opening a different spreadsheet.",
          "The unit price fills in automatically from the quantity band — the old grey formula cells are now built into the app.",
          "Prices come from a single, central template your admin keeps current — no more out-of-date spreadsheets floating around.",
          "The quote saves to the customer's history, emails in one click, and converts straight into a trackable order.",
        ],
      },
      { k: "h", text: "The CAP PRICING tab → quantity bands" },
      { k: "p", text: "On the caps order form, the unit price came from the CAP PRICING tab based on the style (RC, REN, VEL, Animal) and the quantity band. In MakeReady you just pick the cap and type the quantity — the unit price fills from the same bands (RC 72 → $10.50, 144 → $9.25, 288 → $8.25, 432 → $8.00, 576 → $7.75) and updates as you change the quantity. You'll see \"auto-priced by quantity band\" under the line, and a \"below 72 minimum\" note if you're under the style's minimum." },
      { k: "img", src: "quote-builder.png", caption: "Pick the cap and quantity — the unit price fills from the band automatically." },
      { k: "h", text: "Baja & apparel → size upcharges" },
      { k: "p", text: "The Baja form added $2 for 2XL and $3 for 3XL. In MakeReady, choose the Size from the dropdown on the line and the upcharge is added to the unit price for you." },
      { k: "h", text: "Softgoods decoration → Charges & setup" },
      { k: "p", text: "The screen/art/rush charges from the Softgoods form are the \"Charges & setup\" checkboxes: New ASI Screen Prep ($15/color), Reorder Screen Prep ($7.50/color), mid-run color change, art ($65/hr), and rush (+10% for 2 weeks / +20% for 1 week). Tick the ones that apply; per-color and per-hour charges ask for the count. Tick \"Reorder\" and the new-only screen prep drops off — exactly like choosing New vs Reorder on the paper form." },
      { k: "h", text: "Quick start" },
      {
        k: "steps",
        items: [
          { text: "Go to Sales → Quotes → \"New quote\".", img: "quote-new.png", caption: "Start a quote: pick the customer and the product template." },
          { text: "Pick the customer and the product template (Caps (OSH), Baja Hoodies, Softgoods, Wood Products), then open the builder." },
          { text: "Add a line, pick the item, enter the quantity (and Size for apparel) — the unit price fills in automatically." },
          { text: "Tick any Charges & setup that apply, set Reorder if it's a repeat, then Save and email or convert to an order." },
        ],
      },
      { k: "tip", text: "For quantity-priced items you can't overtype the price — it's locked to the band, just like the grey cells you weren't supposed to type in. Need a one-off price? Choose \"custom\" on the line and type your own." },
      { k: "warn", text: "If a band price ever needs to change, that's done once by your admin in the Template Builder — and everyone's quotes use the new number immediately. Don't keep pricing in personal spreadsheets anymore." },
    ],
    related: ["building-a-quote", "editing-and-emailing-a-quote", "order-templates"],
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
      { k: "p", text: "If you quoted a walk-in, search for the company in the \"Customer (Business Partner)\" box and click \"Save customer\" to link it. Linking a customer is what lets MakeReady log the quote to their CRM history." },
      { k: "h", text: "Statuses" },
      { k: "p", text: "Move the quote along with the status buttons: Draft → \"Mark sent\" → \"Accepted\" / \"Rejected\". An accepted quote can be converted to an order. Emailing a draft automatically marks it sent." },
      { k: "p", text: "While a quote is still a Draft you can remove it with \"Delete draft\". Once it's been sent or converted it can no longer be deleted (it stays on record)." },
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
      { k: "h", text: "Hand off to the art department" },
      { k: "p", text: "When the order's details are set, click \"Submit to art →\". This creates an art request, moves the order into the Art & Proof stage, and notifies the art team. The catalogue image the customer picked (carried over from the quote) and the production spec go with it. See The art department workflow." },
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
      { k: "h", text: "Voiding an order" },
      { k: "p", text: "If an order is cancelled, scroll to \"Void order\", enter a reason (required), and confirm. The order stays on record marked \"Voided\" with your reason, its stage/PDF/proof actions are locked, and the customer tracker shows the order as canceled." },
    ],
    related: ["building-a-quote", "art-department", "proof-approvals", "customer-order-tracker"],
  },
  {
    slug: "proof-approvals",
    title: "Proof & art approvals",
    section: "Sales",
    summary: "Send the customer a secure link to approve artwork — recorded with a signature, timestamp, and IP address.",
    who: "Admin, Sales Manager, Sales Rep",
    blocks: [
      { k: "p", text: "Before production, get the customer to sign off on the artwork. MakeReady sends a secure approval link and records their decision — so there's always proof of what was approved." },
      { k: "h", text: "Send a proof" },
      {
        k: "steps",
        items: [
          { text: "On the order, upload the artwork under \"Attachments\" (image or PDF)." },
          { text: "In the \"Proof approvals\" section, give the proof a title, pick the artwork file, add an optional message, and click \"Create proof link\"." },
          { text: "Copy the link or click \"✉ Email link to customer\" to send it in a prefilled message." },
        ],
      },
      { k: "h", text: "What the customer sees" },
      {
        k: "steps",
        items: [
          { text: "The proposed artwork appears right on the customer's order tracking link (no login), so they see it in the same place they follow their order.", img: "proof-on-tracker.png", caption: "The customer reviews the proof on their tracking page." },
          { text: "They choose Approve, Request changes, Decline (each with notes), or Request a meeting, then type their name to sign and submit." },
          { text: "You get a notification and the decision is logged to the customer's CRM history." },
        ],
      },
      { k: "tip", text: "\"Request a meeting\" shows the customer your self-serve booking page so they can pick a time, and notifies you. Handy when the art needs a conversation rather than a note." },
      { k: "tip", text: "Every decision is stamped with the signer's name, the date/time, and their IP address, and shown back on the order — an auditable record of exactly what was approved." },
      { k: "warn", text: "Approving confirms the artwork is correct (spelling, colors, sizes, placement). If the customer requests changes, send a new proof after the art is revised." },
    ],
    related: ["art-department", "orders-and-production-stages", "customer-order-tracker"],
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
      { k: "h", text: "Approving artwork from the tracker" },
      { k: "p", text: "When the art department sends a proof, the proposed image appears on this same tracking page. The customer can approve it, request changes, decline, or request a meeting — right there, without a separate link or login. See Proof & art approvals." },
      { k: "img", src: "proof-on-tracker.png", caption: "A pending proof shown on the customer's tracker, with the approval options." },
    ],
    related: ["art-department", "proof-approvals", "orders-and-production-stages"],
  },
  {
    slug: "art-department",
    title: "The art department workflow",
    section: "Art & Production",
    summary: "From order hand-off to customer proof: the Art queue, the Kanban board, uploading proposed art, and sending a proof.",
    who: "Art, Production, Sales Manager, Admin",
    blocks: [
      { k: "p", text: "Once an order's details are worked out, sales hands it to the art department for design, customization, and proofing. Art picks it up on the Art board, does the work, and sends the customer a proof — which the customer approves on their tracking link." },
      { k: "h", text: "How an order reaches art" },
      { k: "p", text: "On the order page, the salesperson clicks \"Submit to art →\". That creates an art request, moves the order into the Art & Proof stage, and notifies the art team. The catalogue image the customer picked and the production spec travel with it, so art sees exactly what was ordered." },
      { k: "h", text: "The Art board — Queue and Kanban" },
      { k: "img", src: "art-board.png", caption: "The Art Department board — toggle between Queue and Kanban." },
      {
        k: "steps",
        items: [
          { text: "Open Art Department in the sidebar. Toggle between Queue (a sortable list) and Kanban (a board)." },
          { text: "On the Kanban, drag a card between columns — To do → In progress → Proofing → Revisions → Approved → Done — to update its status. In the Queue, use the status dropdown." },
          { text: "Assign a request to yourself or a teammate with the assignee dropdown. Rush jobs are flagged." },
        ],
      },
      { k: "h", text: "Do the work & send a proof" },
      { k: "img", src: "art-request.png", caption: "An art request: order details, spec, customer + proposed images, and the send-proof panel." },
      {
        k: "steps",
        items: [
          { text: "Open a request to see the order, the production spec, and all images — the catalogue image, any customer art/references, and your proposed art. Click any image to open or download the original to edit." },
          { text: "Edit the customer's file in your design tool, then upload your proposed/customized artwork under Images." },
          { text: "Under \"Send a proof to the customer\", give it a title, pick the art to show, add an optional message, and click \"Send proof\". The request moves to Proofing." },
        ],
      },
      { k: "h", text: "What happens next" },
      { k: "p", text: "The proposed image appears on the customer's order tracking link. They approve it, request changes (with notes), decline, or request a meeting. You're notified of their decision, and it's logged to the customer's history. If they request changes, revise the art and send a new proof." },
      { k: "img", src: "proof-on-tracker.png", caption: "The customer reviews and approves the proof on their tracking page." },
      { k: "tip", text: "The customer never needs a login or a separate link — the proof shows up on the same tracker they already use to follow the order." },
    ],
    related: ["proof-approvals", "customer-order-tracker", "orders-and-production-stages"],
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
          { text: "For quantity- or size-priced products, open an item's \"Quantity bands & sizes\" editor to set price bands (e.g. 72 → $10.50, 144 → $9.25), a minimum order quantity, and per-size upcharges (e.g. 2XL +$2, 3XL +$3). These drive the automatic pricing in the Quote Builder." },
          { text: "Upload a catalogue image for the item (optional). It shows next to the item and, when a customer picks it, is carried onto the order so the art department sees exactly what was chosen." },
        ],
      },
      { k: "h", text: "How the price is set" },
      { k: "p", text: "Base sell price = supplier cost × (1 + markup %). Markup is a percentage over cost, not a margin. Changing the default markup or an item's values recalculates the affected prices automatically." },
      { k: "h", text: "Quantity bands & size upcharges" },
      { k: "p", text: "When an item has quantity bands, the band price for the order quantity overrides the base price in the Quote Builder — this is how caps price by 72 / 144 / 288 / 432 / 576. Size upcharges add a set amount on top for the chosen size. A minimum quantity shows the rep a warning when they quote below it. These are exactly the CAP PRICING tab and size rules from the old Excel order forms, now managed here so every rep quotes from the same numbers." },
      { k: "tip", text: "Only Active templates show up in the Quote Builder. Vendor cost feeds can replace manual costs in a later phase." },
    ],
    related: ["building-a-quote", "quoting-for-reps"],
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
          "\"Require two-factor authentication\" — when on, every user must enroll a second factor before using the app. This is currently ON for the whole organization.",
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

  // ─────────────────────────────── Art & Production ──────────────────────────
  {
    slug: "production-jobs",
    title: "The production workflow",
    section: "Art & Production",
    summary: "Send an approved order to the shop floor and track it on the production Kanban board.",
    who: "Admin, Production, Sales Manager",
    blocks: [
      { k: "p", text: "Once art is approved (or for blank/stock orders, straight after the order is created), the order is handed to Production. Open Production from the sidebar." },
      { k: "h", text: "Sending an order to production" },
      { k: "p", text: "From the order, click \"Send to production\". MakeReady creates a production job, notifies the production team, and moves the order into its production stage on the customer tracker." },
      { k: "h", text: "The production board" },
      { k: "p", text: "Production has two views: a Queue list and a drag-and-drop Kanban board. Drag a job across the columns as work progresses:" },
      {
        k: "list",
        items: [
          "Queued — waiting to start",
          "In production — being made",
          "Quality check — inspection",
          "Ready to ship — done, awaiting dispatch",
          "Shipped — handed to the carrier",
        ],
      },
      { k: "p", text: "Open any job to see the full production spec and the approved artwork, assign an operator, and set rush flags and due dates." },
      { k: "tip", text: "Moving a job across the board automatically advances the stage the customer sees on their public order tracker — no separate update needed." },
    ],
    related: ["orders-and-production-stages", "art-department", "customer-order-tracker"],
  },

  // ─────────────────────────────── Inventory ─────────────────────────────────
  {
    slug: "inventory-overview",
    title: "Inventory & stock levels",
    section: "Inventory",
    summary: "The item master, on-hand quantities, low-stock flags, and the stock ledger (receive / consume / count / adjust).",
    who: "Admin, Production, Warehouse",
    blocks: [
      { k: "p", text: "Open Inventory from the sidebar to see the item master — every stocked SKU with its category, unit, supplier, cost, quantity on hand, and reorder point." },
      { k: "h", text: "Finding items" },
      { k: "p", text: "Search by SKU or name and page through the list. Items at or below their reorder point are flagged as low stock so you know what to reorder." },
      { k: "h", text: "Moving stock" },
      { k: "p", text: "Open an item to record stock movements. Every movement is one of four kinds and is written to a permanent ledger:" },
      {
        k: "list",
        items: [
          "Receive — stock coming in",
          "Consume — stock used on a job",
          "Count — set the quantity to a physical count",
          "Adjust — correct by a positive or negative amount (with a reason)",
        ],
      },
      { k: "p", text: "The item's on-hand quantity is always the sum of the stock in its bins (see Bin management). The item detail page shows the full movement history and the stock-by-bin breakdown." },
      { k: "tip", text: "The MakeReady catalogue was seeded from the SAP Business One data — 6,219 stocked items across 46 categories and 4 warehouses — so you're working from real numbers on day one." },
    ],
    related: ["bin-management", "reports-overview"],
  },
  {
    slug: "bin-management",
    title: "Warehouses & bin management",
    section: "Inventory",
    summary: "Warehouses, bins, per-bin stock as the source of truth, and transferring stock between bins.",
    who: "Admin, Warehouse",
    blocks: [
      { k: "p", text: "MakeReady tracks stock down to the individual shelf. A warehouse contains bins, and each bin holds a quantity of a given item. An item's total on-hand is the sum of its bin quantities — bins are the source of truth." },
      { k: "h", text: "Managing warehouses & bins" },
      { k: "p", text: "Open Inventory → Bins to view warehouses and their bins. Create a warehouse, then add bins (by code/label) to match your physical layout." },
      { k: "h", text: "Stock at a bin" },
      { k: "p", text: "When you receive, consume, count, or adjust stock, you do it at a specific bin — so the system always knows not just how many you have, but where they are." },
      { k: "h", text: "Transferring stock" },
      { k: "p", text: "Use a transfer to move a quantity from one bin to another (e.g. from bulk storage to a pick face). Transfers keep the item's total on hand unchanged and are recorded in the movement history." },
      { k: "warn", text: "Because on-hand is derived from bins, always place received stock into a bin — otherwise it won't count toward the item's available quantity." },
    ],
    related: ["inventory-overview"],
  },

  // ─────────────────────────────── Reports & Analytics ───────────────────────
  {
    slug: "reports-overview",
    title: "Reports & dashboards",
    section: "Reports & Analytics",
    summary: "The executive dashboard — headline KPIs, visual charts, breakdowns, low-stock, and one-click CSV export.",
    who: "Admin, Sales Manager, Finance",
    blocks: [
      { k: "p", text: "Open Reports from the sidebar for an at-a-glance picture of the business. The top of the page shows headline KPIs (accounts, pipeline, open quotes and their value, open orders, inventory valuation), followed by a set of visual charts and written breakdowns." },
      { k: "h", text: "The charts" },
      { k: "p", text: "Charts are drawn on real, dense data and always label their values so nothing is guesswork:" },
      {
        k: "list",
        items: [
          "Accounts by lifecycle stage (leads, prospects, customers) with exact counts",
          "Accounts by state and by account group",
          "Inventory value and on-hand units by category",
          "Orders by stage across the active pipeline",
        ],
      },
      { k: "h", text: "Exporting" },
      { k: "p", text: "Each breakdown has a CSV export link so you can pull the underlying numbers into a spreadsheet." },
      { k: "tip", text: "For the sales pipeline by customer, remember the CRM account page now shows each customer's full order history and lifetime spend." },
    ],
    related: ["building-and-scheduling-reports", "managing-an-account"],
  },
  {
    slug: "building-and-scheduling-reports",
    title: "Building & scheduling custom reports",
    section: "Reports & Analytics",
    summary: "A Crystal Reports-style builder: pick a source, choose columns and filters, group with subtotals, save, export to CSV/PDF, and email on a schedule.",
    who: "Admin, Sales Manager, Finance",
    blocks: [
      { k: "p", text: "Beyond the dashboard, you can build and save your own reports. Open Reports → \"New report\" (or edit a saved one)." },
      { k: "h", text: "Building a report" },
      {
        k: "steps",
        items: [
          { text: "Pick a data source — Business Partners, Quotes, Orders, Inventory items, Production jobs, or Stock movements." },
          { text: "Choose the columns you want as chips, in the order they should appear." },
          { text: "Add filters (e.g. stage is one of lead, prospect; or on-hand greater than 0). Filters are safe and only ever read your data." },
          { text: "Optionally pick a \"Group by\" field to cluster rows with per-group subtotals and a grand total." },
          { text: "Set a sort column and direction and a row limit, watch the live preview, then \"Save report\"." },
        ],
      },
      { k: "h", text: "Running & exporting" },
      { k: "p", text: "Open a saved report to run it. Grouped reports show subtotals and a grand total. Export the results as CSV, or as a formatted PDF (large grouped reports export as a subtotal summary to stay fast — use CSV for full line detail)." },
      { k: "h", text: "Scheduled email delivery" },
      { k: "p", text: "On a report, set up a schedule — daily, weekly (choose the day), or monthly (choose the day of month) — pick CSV or PDF, and enter recipient email addresses. MakeReady emails the report to that list automatically from the g54.com domain." },
      { k: "tip", text: "A set of recommended reports and KPI scorecards is already seeded — active pipeline, open/won quotes, open orders by stage, production WIP, inventory valuation by category, and recent stock receipts — ready to run or schedule." },
      { k: "warn", text: "Report building is limited to Admin, Sales Manager, and Finance roles." },
    ],
    related: ["reports-overview"],
  },

  // ─────────────────────────────── Administration ────────────────────────────
  {
    slug: "security-and-data-protection",
    title: "Security & data protection",
    section: "Administration",
    summary: "How MakeReady protects accounts and data: MFA, lockout, rate limiting, browser hardening, the WAF, audit logging, and encrypted offsite backups.",
    who: "Admin only",
    blocks: [
      { k: "p", text: "This article summarizes the platform's security posture for administrators and auditors. Most of it works automatically in the background." },
      { k: "h", text: "Accounts & sign-in" },
      {
        k: "list",
        items: [
          "Passwords are bcrypt-hashed with a strength policy (min 10 characters, upper/lower/number).",
          "Two-factor authentication (authenticator app or passkey) is required for every user, with single-use recovery codes.",
          "Accounts lock for 15 minutes after 5 failed attempts, and admins are notified.",
          "One active session per user; signing in elsewhere ends the previous session.",
        ],
      },
      { k: "h", text: "Rate limiting & the firewall" },
      { k: "p", text: "Sensitive endpoints are throttled in two layers. In the application, sign-in, password-reset, and MFA-verification attempts are rate-limited (per network address, and per user for MFA codes) — tripping the MFA limit tears down the pending sign-in. At the network edge, a Vercel Web Application Firewall rule rate-limits the sign-in and password-reset pages by IP before traffic ever reaches the app." },
      { k: "h", text: "Browser hardening" },
      { k: "p", text: "Every response carries a strict Content-Security-Policy (with a per-request nonce), HSTS, anti-framing, and related headers to resist XSS, clickjacking, and downgrade attacks." },
      { k: "h", text: "Audit & backups" },
      {
        k: "list",
        items: [
          "An append-only audit log records every meaningful change (retained 13+ months); see The audit log.",
          "The database is backed up nightly as an AES-256-encrypted snapshot stored offsite, retained 30 days and integrity-checked.",
          "Neon's point-in-time restore provides short-window recovery on top of the nightly snapshots.",
        ],
      },
      { k: "warn", text: "The nightly backup is encrypted with a passphrase held outside the app. Keep that passphrase safe in your password manager — without it the backups cannot be restored." },
    ],
    related: ["two-factor-authentication", "audit-log", "system-configuration"],
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
