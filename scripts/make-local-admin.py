#!/usr/bin/env python3
"""
Creates local-admin.html — a no-login version of public/admin.html for local use.
"""
import re

SRC = 'public/admin.html'
DST = 'local-admin.html'

with open(SRC, 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Remove login gate block (from <div id="loginGate"> up to the TOPBAR comment)
login_gate = re.search(
    r'<div id="loginGate">.*?</div>\s*<!-- ── TOPBAR ──',
    html, re.DOTALL
)
if login_gate:
    html = html[:login_gate.start()] + html[login_gate.end():]
    print('[1/4] Removed login gate block')

# 2. Keep the hardcoded SB_URL/SB_KEY defaults as-is. They are declared in the
#    SAME <script> block as getSbCfg(); calling getSbCfg() during their own
#    initialization caused a temporal-dead-zone ReferenceError that killed the
#    whole panel on a fresh start with no saved config. Settings →
#    "Save & Connect" stores overrides in localStorage key `an_admin_sb_cfg`,
#    which getSbCfg() reads with priority.
print('[2/4] Keeping hardcoded Supabase defaults (localStorage override via getSbCfg)')

# 3. Remove adminLoggedIn variable and related auth gate
html = html.replace(
    'let adminLoggedIn=false; // verified by Supabase session + is_admin check',
    'let adminLoggedIn=false; // (local mode: no login required)'
)
print('[3/4] Updated adminLoggedIn declaration')

# 4. Also remove the auth gate closing comment block if present
html = re.sub(
    r'<!-- ── TOPBAR ──\s*-->',
    '<!-- TOPBAR (local mode) -->',
    html
)

with open(DST, 'w', encoding='utf-8') as f:
    f.write(html)

print(f'[4/4] Saved {DST}')
