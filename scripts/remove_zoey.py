import os, re

# Simple text substitutions applied across all files
REPLACEMENTS = [
    # Source/origin badges and labels
    ("Zoey B2B",                        "Web Store"),
    ("Zoey b2b",                        "Web Store"),
    ("zoey-b2b",                        "web-store"),

    # Account groups — drop Zoey prefix
    ("Zoey Account Groups",             "Account Groups"),
    ("Zoey Account Group",              "Account Group"),
    ("All Zoey Groups",                 "All Account Groups"),
    ("Zoey Accounts",                   "Web Store Accounts"),
    ("Zoey account",                    "web store account"),

    # Sync / integration labels
    ("Zoey Sync",                       "Published"),
    ("Synced to Zoey via Saltbox",      "Published online"),
    ("synced to Zoey via Saltbox",      "published online"),
    ("synced to Zoey product catalog via Vision33 Saltbox",
                                        "published to the MakeReady Web Store"),
    ("inventory syncs to Zoey product catalog via Vision33 Saltbox",
                                        "inventory published to the MakeReady Web Store"),

    # Subtitle / description references
    ("synced to Zoey Account Groups via Vision33 Saltbox",
                                        "Account Groups &amp; Sales Pipeline"),
    ("Zoey B2B sales and Vision33 Saltbox sync analytics",
                                        "Web Store sales analytics and SAP B1 reporting"),
    ("governing invoices, POs, credits, and Zoey B2B order approvals via Vision33 Saltbox",
                                        "governing invoices, POs, credits, and Web Store order approvals"),

    # SAP/doc-flow explanatory text
    ("Zoey B2B orders imported via Vision33 Saltbox create Sales Orders, which flow through to AR Invoices and Incoming Payments here.",
     "Web Store orders create Sales Orders natively, which flow through to AR Invoices and Incoming Payments here."),
    ("sends the tracking update back to Zoey via Vision33 Saltbox.",
     "sends the tracking update back to the Web Store."),

    # Jobs page
    ("Zoey orders import via Vision33 Saltbox and create Sales Orders which flow into the production queue.",
     "Web Store orders create Sales Orders directly, which flow into the production queue."),

    # Sales page header note
    ("Zoey orders import as Sales Orders via Vision33 Saltbox",
     "Web Store orders import as Sales Orders natively"),

    # Sales page summary row
    ("Zoey Status Updates Sent",        "Web Store Updates Sent"),
    ("Via Vision33 Saltbox",            ""),

    # Sales page delivery note description
    # (handled above by the longer send-tracking replacement)

    # Workflow descriptions
    ("Zoey order $7,200 imported via Saltbox, requires approval before SO creation",
     "Web Store order $7,200 received, requires approval before SO creation"),
    ("Zoey order &ge; $5,000",          "Web Store order &ge; $5,000"),
    ("Zoey B2B order approvals via Vision33 Saltbox",
                                        "Web Store order approvals"),
    ("Saltbox (auto)",                  "Web Store (auto)"),
    ("Saltbox Connector:",              ""),
    ("Connector: gmw-zoey-v2 &middot; Last sync:",
                                        "Last sync:"),
    ("Connector: gmw-zoey-v2",          ""),
    ("<code>gmw-zoey-v2</code>",        ""),

    # Not-yet-in-Zoey status
    ("Not yet in Zoey",                 "Not published"),

    # Generic Zoey → Web Store (order remaining after specific ones above)
    ("Zoey orders",                     "web orders"),
    ("Zoey order",                      "web order"),
    ("Recent Zoey Orders",              "Recent Web Orders"),
    ("Zoey &rarr; MakeReady",          "Web Store &rarr; MakeReady"),
    ("MakeReady &rarr; Zoey",          "MakeReady &rarr; Web Store"),
    ("Zoey: In Production",             "Web Store: In Production"),
    ("Zoey (MTD)",                      "Web Store (MTD)"),
    ("Zoey Orders (MTD)",               "Web Orders (MTD)"),

    # Admin integration descriptions
    ("MakeReady integrates with SAP Business One, Zoey B2B eCommerce, and other services via Vision33 Saltbox and direct API connections.",
     "MakeReady integrates with SAP Business One and other services via direct API connections."),
    ("iPaaS connector &mdash; routes data between MakeReady, SAP Business One, and Zoey",
     ""),
    ("Tracking data migration from SAP Business One into MakeReady. Vision33 is managing the migration using Saltbox pipelines.",
     "Tracking data migration from SAP Business One into MakeReady."),
    ("Point of contact: Vision33 implementation team",
     "Point of contact: MakeReady implementation team"),

    # Any remaining Zoey.com URLs
    ("greatmountainwest.zoey.com",      "store.g54.com"),

    # Remaining Vision33 / Saltbox occurrences
    ("Vision33 Saltbox &mdash; Integration Health",
                                        "Web Store &mdash; Integration Health"),
    ("Vision33 Saltbox",                "MakeReady Web Store"),
    ("Vision33 Integration Health",     "Web Store Status"),
    ("Vision33",                        ""),
    ("Saltbox",                         ""),
    ("saltbox",                         ""),

    # Residual bare Zoey references
    ("via Zoey",                        "via Web Store"),
    ("in Zoey",                         "in the Web Store"),
    ("to Zoey",                         "to Web Store"),
    ("from Zoey",                       "from Web Store"),
    ("Zoey.com (B2B eCommerce)",        "MakeReady Web Store"),
    ("Zoey.com",                        "MakeReady Web Store"),
    ("Zoey",                            "Web Store"),
    ("zoey",                            "web-store"),
    ("ZOEY",                            "WEB"),
]

files_dir = r'C:\Projects\GMW\wireframes'
for fname in sorted(os.listdir(files_dir)):
    if not fname.endswith('.html'):
        continue
    path = os.path.join(files_dir, fname)
    with open(path, encoding='utf-8') as f:
        content = f.read()
    original = content
    for old, new in REPLACEMENTS:
        content = content.replace(old, new)
    if content != original:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print('Updated: ' + fname)
    else:
        print('no change: ' + fname)
