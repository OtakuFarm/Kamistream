#!/usr/bin/env python3
"""
Fix the local-admin.html JS errors caused by removing the login gate.
"""
SRC = 'local-admin.html'

with open(SRC, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix 1: Remove the reference to deleted 'loginGate' element in _showAdminUI
content = content.replace(
    "document.getElementById('loginGate').style.display='none';",
    "// loginGate removed in local mode"
)

# Fix 2: Remove the line that tries to addEventListener to 'lgPass'
content = content.replace(
    "document.getElementById('lgPass').addEventListener('keydown',e=>{ if(e.key==='Enter') doAdminLogin(); });",
    "// login entry removed in local mode -- no login needed"
)

with open(SRC, 'w', encoding='utf-8') as f:
    f.write(content)

print('Fixed JS references to deleted elements.')
