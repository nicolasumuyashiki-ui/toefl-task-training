#!/usr/bin/env python3
"""Bump the ?v=YYYYMMDD cache-busting version on shared JS <script> tags.

GitHub Pages serves js/*.js statically and browsers cache them for days.
When you change anything under js/, run this so every client re-fetches the
new code exactly once:

    python3 tools/bump-cache-version.py 20260708            # bump ALL shared js
    python3 tools/bump-cache-version.py 20260708 tm-footer  # bump only tm-footer.js
    python3 tools/bump-cache-version.py 20260708 auth api    # bump a subset

Only STATIC <script src="...js/NAME.js"> tags are rewritten. Dynamic loaders
(auth.js -> api.js, progress.js -> api.js, etc.) carry their own version
through their `$1` back-reference, so bumping the static tags propagates the
new version everywhere automatically.

Names may be given with or without the trailing ".js" (e.g. "tm-footer" or
"tm-footer.js"). If no names are given, every shared js reference is bumped.
The script is idempotent and only rewrites files that actually change.
"""

import os
import re
import sys

# Matches a static script tag src pointing at a js/ file, e.g.
#   src="js/auth.js"                 src='../../js/tm-footer.js?v=20260629'
# Captures: (1) the path up to and including "js/", (2) the bare name,
#           (3) existing "?v=..." query if present.
SRC_RE = re.compile(
    r'(src=["\'](?:\.\./)*js/)([a-z0-9_-]+)\.js(\?v=\d+)?(["\'])'
)

DATE_RE = re.compile(r'^\d{8}$')


def iter_html_files(root):
    for dirpath, dirnames, filenames in os.walk(root):
        # Skip VCS / vendored dirs.
        dirnames[:] = [d for d in dirnames if d not in ('.git', 'node_modules')]
        for name in filenames:
            if name.endswith('.html'):
                yield os.path.join(dirpath, name)


def bump(root, date, names):
    """Return dict{path: (num_replacements)} for files actually changed."""
    want = {n[:-3] if n.endswith('.js') else n for n in names}
    changed = {}

    def repl(m):
        prefix, base, oldq, quote = m.group(1), m.group(2), m.group(3), m.group(4)
        if want and base not in want:
            return m.group(0)  # not in the requested subset -> leave untouched
        return f'{prefix}{base}.js?v={date}{quote}'

    for path in iter_html_files(root):
        with open(path, 'r', encoding='utf-8') as fh:
            original = fh.read()
        new, n = SRC_RE.subn(repl, original)
        if new != original:
            with open(path, 'w', encoding='utf-8') as fh:
                fh.write(new)
            changed[path] = n
    return changed


def main(argv):
    if len(argv) < 2 or not DATE_RE.match(argv[1]):
        sys.stderr.write(
            'usage: bump-cache-version.py <YYYYMMDD> [name ...]\n'
            '       name may be "tm-footer" or "tm-footer.js"; '
            'omit to bump all shared js\n'
        )
        return 2

    date = argv[1]
    names = argv[2:]
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    changed = bump(root, date, names)
    if not changed:
        target = ', '.join(names) if names else 'all shared js'
        print(f'No changes (already at ?v={date} for {target}).')
        return 0

    total = sum(changed.values())
    print(f'Bumped ?v={date} in {len(changed)} file(s), {total} tag(s):')
    for path in sorted(changed):
        rel = os.path.relpath(path, root)
        print(f'  {rel}  ({changed[path]})')
    print('\nCommit these HTML changes together with your js/ change.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
