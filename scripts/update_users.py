import re, sys

# Mapping old user data → new real user data
# order matters: longer/more specific strings first

SIMPLE_REPLACEMENTS = [
    # admin.html users table & audit log
    ("Sandra Miller",           "Britney de Jong"),
    ("s.miller@gmwest.com",     "b.dejong@gmwest.com"),
    ("Sandra",                  "Britney"),

    ("Diego Martinez",          "Kim Lund"),
    ("D. Martinez",             "K. Lund"),
    ("d.martinez@gmwest.com",   "k.lund@gmwest.com"),
    ("Diego",                   "Kim"),

    ("Sara Nguyen",             "Cody de Jong"),
    ("S. Nguyen",               "C. de Jong"),
    ("s.nguyen@gmwest.com",     "c.dejong@gmwest.com"),

    ("Remi Okafor",             "Cody de Jong"),
    ("R. Okafor",               "C. de Jong"),
    ("r.okafor@gmwest.com",     "c.dejong@gmwest.com"),

    ("Tanya Kim",               "Tyson Johnson"),
    ("T. Kim",                  "T. Johnson"),
    ("t.kim@gmwest.com",        "t.johnson@gmwest.com"),

    ("Luis Torres",             "Tyson Johnson"),
    ("L. Torres",               "T. Johnson"),
    ("l.torres@gmwest.com",     "t.johnson@gmwest.com"),

    ("Janet Chen",              "Leslie Weiler"),
    ("J. Chen",                 "L. Weiler"),
    ("j.chen@gmwest.com",       "l.weiler@gmwest.com"),
    ("Janet",                   "Leslie"),

    ("Marcus Bell",             "Tyson Johnson"),
    ("M. Bell",                 "T. Johnson"),
    ("m.bell@gmwest.com",       "t.johnson@gmwest.com"),
    ("Marcus",                  "Tyson"),

    ("Aisha Patel",             "Leslie Weiler"),
    ("A. Patel",                "L. Weiler"),
    ("a.patel@gmwest.com",      "l.weiler@gmwest.com"),

    # crm.html filter dropdowns and activity log
    ("Sarah Chen",              "Leslie Weiler"),
    ("Mike Torres",             "Cody de Jong"),

    # workflows.html abbreviated names
    ("T. Davis",                "C. de Jong"),
    ("L. Adams",                "B. de Jong"),
    ("K. Peterson",             "K. Lund"),
    ("R. Barton",               "C. Wall"),
    ("M. Reynolds",             "C. Wall"),

    # jobs.html Sales Rep column (abbreviated)
    # D. Martinez -> K. Lund already done above
    # S. Nguyen -> C. de Jong already done above
    # R. Okafor -> C. de Jong already done above
]

# Avatar initials replacements (only inside class="user-avatar..." and avatar-xs)
AVATAR_REPLACEMENTS = [
    # (old initials, new initials) - applied only inside avatar elements
    ('>SM<', '>BD<'),   # Sandra Miller -> Britney de Jong
    ('>DM<', '>KL<'),   # Diego Martinez -> Kim Lund
    ('>SN<', '>CJ<'),   # Sara Nguyen -> Cody de Jong
    ('>RO<', '>CJ<'),   # Remi Okafor -> Cody de Jong
    ('>TK<', '>TJ<'),   # Tanya Kim -> Tyson Johnson
    ('>LT<', '>TJ<'),   # Luis Torres -> Tyson Johnson
    ('>JC<', '>LW<'),   # Janet Chen -> Leslie Weiler
    ('>MB<', '>TJ<'),   # Marcus Bell -> Tyson Johnson
    ('>AP<', '>LW<'),   # Aisha Patel -> Leslie Weiler
    ('>SC<', '>LW<'),   # Sarah Chen -> Leslie Weiler
    ('>MT<', '>CJ<'),   # Mike Torres -> Cody de Jong
]

import os
files_dir = r'C:\Projects\GMW\wireframes'

for fname in sorted(os.listdir(files_dir)):
    if not fname.endswith('.html'):
        continue
    path = os.path.join(files_dir, fname)
    with open(path, encoding='utf-8') as f:
        content = f.read()
    original = content

    for old, new in SIMPLE_REPLACEMENTS:
        content = content.replace(old, new)

    for old, new in AVATAR_REPLACEMENTS:
        content = content.replace(old, new)

    if content != original:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        sys.stdout.buffer.write(f"Updated {fname}\n".encode())
    else:
        sys.stdout.buffer.write(f"no change {fname}\n".encode())

sys.stdout.buffer.write(b"Done.\n")
