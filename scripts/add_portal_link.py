import os, re

files_dir = r'C:\Projects\GMW\wireframes'

# Insert a "Requirements" link into the topbar-right div, before the notification bell
OLD = '<div class="topbar-icon">🔔'
NEW = '<a href="requirements-portal.html" class="topbar-portal-link" title="Requirements Portal">📋 Requirements</a>\n        <div class="topbar-icon">🔔'

# Also inject the CSS for that link into the <style> block if it exists, or into styles via inline
# We'll add a small inline style block just before </head>
STYLE_INSERT = '''  <style>
    .topbar-portal-link {
      font-size: 12px; font-weight: 600; color: #6366f1; text-decoration: none;
      padding: 5px 10px; border: 1px solid #c4b5fd; border-radius: 6px;
      background: #ede9fe; margin-right: 4px; white-space: nowrap;
    }
    .topbar-portal-link:hover { background: #ddd6fe; }
  </style>
</head>'''

for fname in sorted(os.listdir(files_dir)):
    if not fname.endswith('.html'):
        continue
    if fname in ('requirements-portal.html', 'auth.html'):
        continue
    path = os.path.join(files_dir, fname)
    with open(path, encoding='utf-8') as f:
        content = f.read()
    if 'requirements-portal.html' in content:
        print(f'skip (already present): {fname}')
        continue
    if OLD not in content:
        print(f'WARN (topbar bell not found): {fname}')
        continue
    updated = content.replace(OLD, NEW, 1)
    updated = updated.replace('</head>', STYLE_INSERT, 1)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(updated)
    print(f'Updated: {fname}')
