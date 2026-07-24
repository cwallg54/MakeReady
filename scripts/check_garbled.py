import sys, os

files_dir = r'C:\Projects\GMW\wireframes'

garbled_patterns = [
    ('arrow_right', 'â†’'),   # â†' = double-encoded →
    ('arrow_left',  'â†‘'),   # â†' = double-encoded ←
    ('checkmark',   'âœ“'),   # âœ" = double-encoded ✓
    ('cross',       'âœ—'),   # âœ— = double-encoded ✗
    ('degree',      'Â°'),          # Â° = double-encoded °
    ('bullet',      'â€¢'),   # â€¢ = double-encoded •
    ('endash',      'â€“'),   # â€" = double-encoded –
    ('emdash',      'â€”'),   # â€" = double-encoded —
    ('ellipsis',    'â€¦'),   # â€¦ = double-encoded …
    ('nbsp',        'Â '),          # Â  = double-encoded non-breaking space
    ('laquo',       'Â«'),          # Â« = double-encoded «
    ('raquo',       'Â»'),          # Â» = double-encoded »
    ('tm',          'â„¢'),    # â„¢ = double-encoded ™
    ('star',        'â˜…'),   # â˜… = double-encoded ★
    ('generic_e2',  'â€'),          # â€ start = double-encoded E2 80 xx sequence
]

any_found = False
for fname in sorted(os.listdir(files_dir)):
    if not fname.endswith('.html'):
        continue
    path = os.path.join(files_dir, fname)
    with open(path, encoding='utf-8') as f:
        content = f.read()
    found = []
    for key, pat in garbled_patterns:
        count = content.count(pat)
        if count:
            found.append(f"{key}({count})")
    if found:
        any_found = True
        sys.stdout.buffer.write(f"GARBLED {fname}: {', '.join(found)}\n".encode())
    else:
        sys.stdout.buffer.write(f"ok      {fname}\n".encode())

if not any_found:
    sys.stdout.buffer.write(b"\nAll files clean.\n")
else:
    sys.stdout.buffer.write(b"\nGarbled patterns found - need further fixing.\n")
