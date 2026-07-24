import os, re

files_dir = r'C:\Projects\GMW\wireframes'

# Regex: find the div.sidebar-section containing "Enterprise" label, capture indentation
PATTERN = re.compile(
    r'(<div class="sidebar-section">\s*<div class="sidebar-section-label">Enterprise</div>)',
    re.DOTALL
)

def replacement(m):
    indent = '  '  # default
    # detect leading whitespace of the matched block from content context
    matched = m.group(1)
    return (
        f'<div class="sidebar-section">\n'
        f'{indent}  <div class="sidebar-section-label">Creative</div>\n'
        f'{indent}  <a href="library.html">\U0001f3a8 Content Library</a>\n'
        f'{indent}</div>\n'
        f'{indent}{matched}'
    )

for fname in sorted(os.listdir(files_dir)):
    if not fname.endswith('.html'):
        continue
    if fname == 'library.html':
        continue
    path = os.path.join(files_dir, fname)
    with open(path, encoding='utf-8') as f:
        content = f.read()
    if 'Content Library' in content:
        print(f'skip (already present): {fname}')
        continue
    if not PATTERN.search(content):
        print(f'WARN (Enterprise section not found): {fname}')
        continue
    updated = PATTERN.sub(replacement, content, count=1)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(updated)
    print(f'Updated: {fname}')
