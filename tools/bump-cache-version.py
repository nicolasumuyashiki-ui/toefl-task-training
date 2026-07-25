#!/usr/bin/env python3
"""Bump / verify the ?v=YYYYMMDD cache-busting query string on shared js/*.js tags.

Usage:
  python3 tools/bump-cache-version.py YYYYMMDD        # bump（js/ を変更したら必ず実行）
  python3 tools/bump-cache-version.py --check         # 検証のみ（書き込まない）
  python3 tools/bump-cache-version.py --check --base origin/main   # CI 用

Bump rewrites every `src="...js/NAME.js?v=OLDDATE"` (or `src="...js/NAME.js"`
with no version yet) across all *.html files, and writes the SAME value into
version.json. Dynamic loaders (auth.js -> api.js, progress.js -> api.js,
admin-answer-overlay.js/student-history.js -> ...) inherit their version from
the referencing page's own script tag at runtime, so bumping the static
<script src> tags is sufficient — see CLAUDE.md "共有JSのキャッシュバスティング".

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
   なった。過去に配布した最大値以下の値を渡されたら実行を拒否する。

`--check` は .github/workflows/cache-version-guard.yml から呼ばれ、上記2点に
加えて「js/ を変更したのに版を上げていない PR」を落とす。人の記憶に依存する
運用をやめるための最後の砦なので、ロジックは bump と同じ関数を共有している。
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

# 共有JS の置き場所。ここが変わったら版を上げなければ客に届かない。
JS_DIRS = ("js/", "practice-test/js/")


def git(root: Path, *args: str, check: bool = True) -> str:
    r = subprocess.run(["git", *args], cwd=root, capture_output=True, text=True)
    if check and r.returncode != 0:
        raise subprocess.CalledProcessError(r.returncode, r.args, r.stdout, r.stderr)
    return r.stdout


def html_files(root: Path):
    for path in root.rglob("*.html"):
        if not any(part in SKIP_DIRS for part in path.parts):
            yield path


def read_build(root: Path) -> str:
    return str(json.loads((root / "version.json").read_text(encoding="utf-8"))["build"])


def collect_versions(root: Path) -> set:
    seen = set()
    for path in html_files(root):
        seen.update(VER_RE.findall(path.read_text(encoding="utf-8")))
    return seen


def highest_ever_shipped(root: Path, deep: bool = False) -> str:
    """過去に本番へ出た版の最大値。

    走査対象は version.json の全履歴＋現在の作業ツリー。version.json は
    js/version-guard.js（自動更新）と同時に #171 で導入されたので、
    「ガードが比較しうる版」はすべてこの履歴に含まれる。#171 より前の
    HTML にも ?v= はあるが、その頃の端末はガード自体を持たないため
    単調増加の制約とは無関係。

    deep=True で全コミットの HTML も走査する（bump 時のみ・数秒かかる）。
    """
    seen = set()
    try:
        revs = git(root, "rev-list", "HEAD", "--", "version.json").split()
        for rev in revs:
            txt = git(root, "show", f"{rev}:version.json", check=False)
            if not txt.strip():
                continue
            try:
                build = str(json.loads(txt)["build"])
            except (ValueError, KeyError):
                continue
            if re.fullmatch(r"\d{8}", build):
                seen.add(build)
        if deep:
            for rev in git(root, "rev-list", "--all").split():
                out = git(root, "grep", "-hoE", r"\?v=[0-9]{8}", rev, "--", "*.html", check=False)
                seen.update(m[3:] for m in out.split())
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("warning: git history unavailable; checking the worktree only.", file=sys.stderr)
    seen |= collect_versions(root)
    vj = root / "version.json"
    if vj.exists():
        build = read_build(root)
        if re.fullmatch(r"\d{8}", build):
            seen.add(build)
    return max(seen) if seen else "0"


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
    old = read_build(root)
    path.write_text(text.replace(old, version), encoding="utf-8")
    print(f"version.json: {old} -> {version}")


def verify(root: Path, version: str) -> None:
    """Fail loudly if HTML and version.json disagree — that combination makes
    every client reload-loop until the guard's 2-try cap stops it."""
    stray = sorted(collect_versions(root) - {version})
    build = read_build(root)
    if stray or build != version:
        sys.exit(f"VERIFY FAILED: html={stray or 'ok'} version.json={build} expected={version}")
    print(f"verified: every ?v= and version.json are {version}.")


# ---------------------------------------------------------------- check mode
def cmd_check(root: Path, base: str) -> int:
    problems = []
    build = read_build(root)
    print(f"version.json build = {build}")

    # ① HTML と version.json の一致（ずれている間、全端末がリロードを繰り返す）
    stray = sorted(collect_versions(root) - {build})
    if stray:
        problems.append(
            f"HTML の ?v= が version.json と不一致: {stray} != {build}\n"
            f"   → python3 tools/bump-cache-version.py <新しい版> で揃えてください。"
        )
    else:
        print("OK ① 全 HTML の ?v= と version.json が一致")

    # ② 単調増加（下げると、下げる前の版を掴んだ端末が更新不能になる）
    hi = highest_ever_shipped(root)
    if build < hi:
        problems.append(
            f"版番号が過去最大より小さい: {build} < {hi}\n"
            f"   → {hi} を掴んだ端末は version-guard が「自分の方が新しい」と誤判定し、\n"
            f"      二度と自動更新されません。{hi} より大きい値にしてください。"
        )
    else:
        print(f"OK ② 単調増加（過去最大 {hi} 以上）")

    # ③ js/ を変更したなら版を上げる（上げ忘れると客のブラウザに届かない）
    if base:
        try:
            changed = git(root, "diff", "--name-only", f"{base}...HEAD").splitlines()
        except subprocess.CalledProcessError:
            changed = git(root, "diff", "--name-only", base).splitlines()
        touched = [p for p in changed if p.startswith(JS_DIRS)]
        if touched:
            base_json = git(root, "show", f"{base}:version.json", check=False)
            try:
                base_build = str(json.loads(base_json)["build"]) if base_json.strip() else ""
            except (ValueError, KeyError):
                base_build = ""
            if base_build and build == base_build:
                problems.append(
                    "js/ を変更しているのに版番号が据え置き（" + build + "）。\n"
                    "   変更ファイル: " + ", ".join(touched[:8])
                    + (" ほか" if len(touched) > 8 else "") + "\n"
                    "   → お客様のブラウザは古い JS を掴んだままで、修正が届きません。\n"
                    "      python3 tools/bump-cache-version.py <新しい版> を同じコミットに含めてください。"
                )
            else:
                print(f"OK ③ js/ 変更あり（{len(touched)} ファイル）→ 版を {base_build or '?'} から {build} に更新済み")
        else:
            print("OK ③ js/ の変更なし（版の更新は不要）")
    else:
        print("skip ③ --base 未指定のため js/ 変更チェックは省略")

    if problems:
        print("\n" + "=" * 60, file=sys.stderr)
        print("キャッシュ版番号チェック 失敗", file=sys.stderr)
        print("=" * 60, file=sys.stderr)
        for i, p in enumerate(problems, 1):
            print(f"\n[{i}] {p}", file=sys.stderr)
        print("\n背景: CLAUDE.md「共有JSのキャッシュバスティング」/「版番号は単調増加」", file=sys.stderr)
        return 1
    print("\nすべて OK。")
    return 0


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    argv = sys.argv[1:]

    if argv and argv[0] == "--check":
        base = ""
        if "--base" in argv:
            i = argv.index("--base")
            if i + 1 < len(argv):
                base = argv[i + 1]
        sys.exit(cmd_check(root, base))

    if len(argv) != 1 or not re.fullmatch(r"\d{8}", argv[0]):
        print(__doc__.strip().split("\n\n")[1], file=sys.stderr)
        sys.exit(1)
    version = argv[0]

    hi = highest_ever_shipped(root, deep=True)
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
