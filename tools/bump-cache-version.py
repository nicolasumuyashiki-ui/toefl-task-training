#!/usr/bin/env python3
"""Bump the ?v=YYYYMMDD cache-busting query string on shared js/*.js <script src> tags.

Usage: python3 tools/bump-cache-version.py YYYYMMDD

Rewrites every `src="...js/NAME.js?v=OLDDATE"` (or `src="...js/NAME.js"` with
no version yet) reference across all *.html files in the repo to the given
date. Dynamic loaders (auth.js -> api.js, progress.js -> api.js,
admin-answer-overlay.js/student-history.js -> ...) pick up their version from
the referencing page's own script tag at runtime, so bumping only the static
<script src> tags is sufficient — see CLAUDE.md "共有JSのキャッシュバスティング".
"""
import re
import sys
from pathlib import Path

SKIP_DIRS = {".git", "node_modules", "legacy"}

SRC_RE = re.compile(r'(src=["\'][^"\']*js/[A-Za-z0-9_-]+\.js)(\?v=\d{8})?(["\'])')


def bump(root: Path, version: str) -> int:
    changed = 0
    for path in root.rglob("*.html"):
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        text = path.read_text(encoding="utf-8")
        new_text, n = SRC_RE.subn(rf"\g<1>?v={version}\3", text)
        if n and new_text != text:
            path.write_text(new_text, encoding="utf-8")
            changed += 1
            print(f"bumped {n} ref(s): {path}")
    return changed


def main() -> None:
    if len(sys.argv) != 2 or not re.fullmatch(r"\d{8}", sys.argv[1]):
        print("Usage: python3 tools/bump-cache-version.py YYYYMMDD", file=sys.stderr)
        sys.exit(1)
    version = sys.argv[1]
    root = Path(__file__).resolve().parent.parent
    total = bump(root, version)
    print(f"Done. {total} file(s) updated to ?v={version}.")


if __name__ == "__main__":
    main()
