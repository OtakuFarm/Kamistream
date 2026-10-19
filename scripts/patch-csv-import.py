#!/usr/bin/env python3
"""
Replaces the broken CSV-import / schedule / refresh region in
public/admin.html and local-admin.html with the client-side block in
scripts/csv-import-block.js.

The old region had three fatal problems:
  1. jaiCsvImport sent GET+body, never passed the MAL IDs, and polled a
     locally-generated jobId that never matched the server's.
  2. It depended on /api/* serverless endpoints that do not exist locally.
  3. jaiFetchSchedule + jaiRefreshMetadata were accidentally declared
     INSIDE jaiCsvImport's poll callback, so their onclick handlers threw
     ReferenceErrors (and jaiRefreshAutoUpdate did not exist at all).

Usage:  python scripts/patch-csv-import.py
"""
import re
import sys

NEW_PATH = 'scripts/csv-import-block.js'
TARGETS = ['public/admin.html', 'local-admin.html']

with open(NEW_PATH, encoding='utf-8') as f:
    NEW = f.read().rstrip('\n')

# From the banner line right above "// CSV BATCH IMPORT" up to (not including)
# the real top-level jaiCsvPaste() which follows the mangled region.
PATTERN = re.compile(
    r'// ═+\r?\n// CSV BATCH IMPORT.*?(?=function jaiCsvPaste\s*\()',
    re.DOTALL,
)

rc = 0
for path in TARGETS:
    with open(path, encoding='utf-8') as f:
        src = f.read()

    m = PATTERN.search(src)
    if not m:
        print(f'[SKIP] {path}: CSV region not found (already patched?)')
        continue

    replacement = NEW
    if '\r\n' in src and '\r\n' not in NEW:
        replacement = NEW.replace('\n', '\r\n')

    out = src[:m.start()] + replacement + ('\r\n\r\n' if '\r\n' in src else '\n\n') + src[m.end():]

    # Sanity checks before writing
    assert out.count('async function jaiCsvImport(){') == 1, path
    assert out.count('function jaiFetchSchedule(){') == 1, path
    assert out.count('async function jaiRefreshAutoUpdate(){') == 1, path
    assert 'function jaiCsvPaste(){' in out, path
    assert "/api/import-bulk?action=run'" not in out, path  # old fetch('...run',{ ...) is gone (display text may still mention the URL)

    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(out)
    print(f'[OK] {path}: patched ({m.end() - m.start()} chars -> {len(replacement)} chars)')
    rc = 0

sys.exit(rc)
