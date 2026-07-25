#!/usr/bin/env python3
"""Bump the ?v=YYYYMMDD cache-busting query string on shared js/*.js <script src> tags.

Usage: python3 tools/bump-cache-version.py YYYYMMDD

Rewrites every `src="...js/NAME.js?v=OLDDATE"` (or `src="...js/NAME.js"` with
no version yet) reference across all *.html files in the repo to the given
date, and writes the SAME value into version.json. Dynamic loaders
(auth.js -> api.js, progress.js -> api.js, admin-answer-overlay.js/
student-history.js -> ...) pick up their version from the referencing page's
own script tag at runtime, so bumping only the static <script src> tags is
sufficient — see CLAUDE.md "共有JSのキャッシュバスティング".

TWO INVARIANTS THIS SCRIPT ENFORCES (2026-07-25 事故・再発防止)
--------------------------------------------------------------
1. version.json の build と全 HTML の ?v= は常に同じ値。
   js/version-guard.js は「自ページの ?v=」と「version.json の build」を
   突き合わせて自動更新するため、片方だけ動かすと全端末がリロードを
   繰り返す。version.json は #171 で追加されたが当時この script には
   反映されておらず、手作業 bump の温床になっていた。

2. 版番号は単調増加（実日付より進んでいて構わない）。
   2026-07-19〜07-22 に実日付を超える未来日が7回連続で配布され
   （最大 20260810）、その後 20260723 へ巻き戻された結果、逸脱期間の
   版を掴んだ端末が「自分の方が新しい」と誤判定して二度と更新されなく
   なった。過去に配布した全 ?v= の最大値を git 履歴から求め、それ以下の
   値を渡されたら実行を拒否する。
"""
import json
import re
import subprocess
import sys
from pathlib import Path

SKIP_DIRS = {".git", "node_modules"}

SRC_RE = re.compile(r'(src=["\'][^"\']*js/[A-Za-z0-9_-]+\.js)(\?v=\d{8})?(["\'])')
# 共有JS のトークンだけを対象にする。admin/index.html の
# `pt-keys.json?v=20260722b` のように英字サフィックス付きの手動トークンは
# 別系統（version-guard とは無関係なデータファイルのキャッシュ避け）なので、
# 走査・検証のどちらからも除外する。
VER_RE = re.compile(r"\?v=(\d{8})(?![0-9A-Za-z])")


def highest_ever_shipped(root: Path) -> str:
    """Largest ?v= token in ANY commit on ANY ref, plus the current worktree.

    Scanning history (not just HEAD) matters: the offending future-dated
    versions were superseded on main, so a HEAD-only check would happily let
    us pick a value that stranded devices are already above.
    """
    seen = set()
    try:
        revs = subprocess.run(["git", "rev-list", "--all"], cwd=root, check=True,
                              capture_output=True, text=True).stdout.split()
        for rev in revs:
            out = subprocess.run(["git", "grep", "-hoE", r"\?v=[0-9]{8}", rev, "--", "*.html"],
                                 cwd=root, capture_output=True, text=True).stdout
            seen.update(m[3:] for m in out.split())
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("warning: git history unavailable; checking the worktree only.", file=sys.stderr)
    for path in html_files(root):
        seen.update(VER_RE.findall(path.read_text(encoding="utf-8")))
    vj = root / "version.json"
    if vj.exists():
        build = str(json.loads(vj.read_text(encoding="utf-8")).get("build", ""))
        if re.fullmatch(r"\d{8}", build):
            seen.add(build)
    return max(seen) if seen else "0"


def html_files(root: Path):
    for path in root.rglob("*.html"):
        if not any(part in SKIP_DIRS for part in path.parts):
            yield path


def bump(root: Path, version: str) -> int:
    changed = 0
    for path in html_files(root):
        text = path.read_text(encoding="utf-8")
        new_text, n = SRC_RE.subn(rf"\g<1>?v={version}\3", text)
        if n and new_text != text:
            path.write_text(new_text, encoding="utf-8")
            changed += 1
            print(f"bumped {n} ref(s): {path}")
    return changed


def bump_version_json(root: Path, version: str) -> None:
    """Rewrite ONLY the build value, preserving the file's exact formatting."""
    path = root / "version.json"
    if not path.exists():
        print("warning: version.json not found — 自動更新が無効化されます。", file=sys.stderr)
        return
    text = path.read_text(encoding="utf-8")
    old = str(json.loads(text)["build"])
    path.write_text(text.replace(old, version), encoding="utf-8")
    print(f"version.json: {old} -> {version}")


def verify(root: Path, version: str) -> None:
    """Fail loudly if HTML and version.json disagree — that combination makes
    every client reload-loop until the guard's 2-try cap stops it."""
    stray = sorted({v for path in html_files(root)
                    for v in VER_RE.findall(path.read_text(encoding="utf-8"))} - {version})
    build = str(json.loads((root / "version.json").read_text(encoding="utf-8"))["build"])
    if stray or build != version:
        sys.exit(f"VERIFY FAILED: html={stray or 'ok'} version.json={build} expected={version}")
    print(f"verified: every ?v= and version.json are {version}.")


def main() -> None:
    if len(sys.argv) != 2 or not re.fullmatch(r"\d{8}", sys.argv[1]):
        print("Usage: python3 tools/bump-cache-version.py YYYYMMDD", file=sys.stderr)
        sys.exit(1)
    version = sys.argv[1]
    root = Path(__file__).resolve().parent.parent

    hi = highest_ever_shipped(root)
    if version <= hi:
        sys.exit(
            f"REFUSED: {version} <= 過去に配布した最大値 {hi}。\n"
            "版番号は単調増加させること（実日付より進んでいて構わない）。\n"
            "下げると、下げる前の版を掴んだ端末が更新不能のまま取り残されます。"
        )

    total = bump(root, version)
    bump_version_json(root, version)
    verify(root, version)
    print(f"Done. {total} file(s) updated to ?v={version}.")


if __name__ == "__main__":
    main()
