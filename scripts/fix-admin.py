#!/usr/bin/env python3
"""
Fix the local-admin.html login gate removal issue.
"""
SRC = 'local-admin.html'

with open(SRC, 'r', encoding='utf-8') as f:
    html = f.read()

# Fix 1: Remove the stray --> after the LOGIN GATE comment
html = html.replace(
    '<!-- ── LOGIN GATE ── -->\n -->',
    '<!-- LOGIN GATE (removed — local mode) -->'
)

# Fix 2: Ensure the login gate div is removed
if '<div id="loginGate">' in html:
    html = re.sub(
        r'<!-- ── LOGIN GATE ── -->\s*<div id="loginGate">.*?</div>\s*<!-- ── TOPBAR ──',
        '<!-- LOGIN GATE (removed) --> <!-- TOPBAR (local mode) -->',
        html, flags=re.DOTALL
    )

with open(SRC, 'w', encoding='utf-8') as f:
    f.write(html)

print('Fixed!')
print('loginGate div present? ', '<div id="loginGate">' in html)
