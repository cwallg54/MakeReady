import os

fixes = [
    ('class="app-body"',    'class="app-layout"'),
    ('class="main-wrap"',   'class="main-wrapper"'),
    ('class="page-content"','class="main-content"'),
]

files_dir = r'C:\Projects\GMW\wireframes'
for fname in sorted(os.listdir(files_dir)):
    if not fname.endswith('.html'):
        continue
    path = os.path.join(files_dir, fname)
    with open(path, encoding='utf-8') as f:
        content = f.read()
    original = content
    for old, new in fixes:
        content = content.replace(old, new)
    if content != original:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print('Fixed: ' + fname)
    else:
        print('ok:    ' + fname)
