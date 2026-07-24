import re

pages = ['index.html', 'accounting.html', 'crm.html', 'sales.html', 'inventory.html']
for fname in pages:
    with open(r'C:\Projects\GMW\wireframes\\' + fname, encoding='utf-8') as f:
        html = f.read()
    body = re.search(r'<body[^>]*>', html)
    wrap = re.search(r'<div class="(app|main|wrap|content)[^"]*"', html)
    main_tag = re.search(r'<main[^>]*>', html)
    print(fname + ':')
    print('  body:     ' + (body.group() if body else '?'))
    print('  wrap div: ' + (wrap.group() if wrap else '?'))
    print('  main tag: ' + (main_tag.group() if main_tag else '?'))
