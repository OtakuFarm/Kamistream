# -*- coding: utf-8 -*-
"""Fix local-admin.html: show admin UI without login (local mode)."""
import io, re, sys

PATH = 'local-admin.html'
src = io.open(PATH, 'r', encoding='utf-8').read()

# 1) Remove the dead code that sits after </html> (it never ran anyway)
src = re.sub(
    r'</html>\s*// ── LOCAL MODE.*?\}\)\(\);\s*$',
    '</html>\n',
    src,
    flags=re.S,
)

# 2) Inject a real <script> block just before </body> so it actually executes
fix_script = (
    '<script>\n'
    '// ── LOCAL MODE: show the admin UI directly (no login gate) ──\n'
    '(function showLocalUI(){\n'
    '  function show(){\n'
    "    var t = document.getElementById('adminUI');\n"
    "    var l = document.getElementById('adminLayout');\n"
    "    if(t) t.style.display = 'flex';\n"
    "    if(l) l.style.display = 'flex';\n"
    "    // Populate Supabase config fields + auto-test the connection on load\n"
    "    try{ if(typeof sbCheckStatus === 'function') setTimeout(sbCheckStatus, 400); }catch(e){}\n"
    "    console.log('[Local Admin] UI shown in local mode');\n"
    '  }\n'
    "  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show);\n"
    '  else show();\n'
    '})();\n'
    '</script>\n'
)

if 'showLocalUI' in src and '<script>\n// ── LOCAL MODE' in src:
    print('OK: fix script already present')
    sys.exit(0)

# Insert before the LAST </body>
idx = src.rfind('</body>')
if idx == -1:
    print('ERROR: </body> not found')
    sys.exit(1)
src = src[:idx] + fix_script + src[idx:]

io.open(PATH, 'w', encoding='utf-8', newline='').write(src)
print('OK: injected showLocalUI script before </body>')
print('ends with </html>:', src.rstrip().endswith('</html>'))
print('dead code after </html>:', src.split('</html>')[-1].strip() != '')
