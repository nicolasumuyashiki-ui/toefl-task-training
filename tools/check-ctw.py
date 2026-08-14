#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
check-ctw.py — CTW（Complete the Words）の空所仕様を機械検証する。

背景（2026-08-07 監査）
  CLAUDE.md / .claude/commands/new-ctw.md の v3.5.2 は、空所の作り方を
  「表示＝先頭 floor(n/2) 文字・手調整禁止・厳密交互」と完全に機械的な
  ルールで定めている。にもかかわらず 2026-07-02 の全面リビルド (#124/#125)
  は reading/ctw/ だけを対象にしており、practice-test/ 配下の CTW 9 ファイルは
  v3.5.2 以前のまま取り残されて 50/89 の空所が仕様から外れていた。
  ルールが完全に機械判定できる以上、人間の目視監査に頼るべきではない。
  → 本スクリプトを CI に載せて、以後の逸脱を機械的に止める。

検証するルール
  R1 floor(n/2)   : 表示文字数 == len(単語)//2
  R2 最小長       : 空所にする単語は len >= 2
  R3 厳密交互     : 空所が隣接しない（target 形式のみ判定可能）
  R4 件数         : target 形式 = 20 トークン / 10 空所、blanks 形式 = 10 空所
  R5 空白混入     : 空所単語に空白を含まない（"a few" のような複数語を禁止）

対応データ形式
  A) reading/ctw/*-set-*.html          : var D={... "target":[{"w","a","s","p"}] }
  B) practice-test/**/reading-ctw.html : var D={ target:[{w:"",a:"",s:""}] }（キー無引用符）
  C) practice-test/**/reading-m2*-ctw  : var blanks=[{given:"",answer:""}]

ベースライン運用（重要）
  既存の practice-test/ の逸脱は「据え置き（B案）」の判断がなされている。
  answer/blanks を変更すると CLAUDE.md の旧版アーカイブ＋era 境界の手続きが
  必要になり、受講記録の復元性に影響するため。
  そこで既知の逸脱を tools/ctw-baseline.json に凍結し、
    - ベースラインより増えたら          → FAIL（新規の逸脱を止める）
    - ベースラインに無いファイルが汚れたら → FAIL
    - 減ったら                          → PASS（ベースライン更新を促す）
  とする。reading/ctw/ は現在 0 件なので、実質そのまま厳格チェックになる。

使い方
  python3 tools/check-ctw.py              # 全ファイルの詳細レポート
  python3 tools/check-ctw.py --check      # CI 用。ベースライン比較で exit 1
  python3 tools/check-ctw.py --strict     # ベースラインを無視して完全準拠を要求
  python3 tools/check-ctw.py --update-baseline
"""

from __future__ import print_function

import glob
import io
import json
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASELINE_PATH = os.path.join(REPO, "tools", "ctw-baseline.json")

# legacy/ は当時の記録をそのまま保存する復習専用アーカイブなので検証しない
# （直すと過去の受講記録と食い違う）。
TARGET_GLOBS = [
    "reading/ctw/practice-*-set-*.html",
    "practice-test/reading-*ctw.html",
    "practice-test/test*/reading-*ctw.html",
]
EXCLUDE_PARTS = ("/legacy/", "/legacy-")


# --------------------------------------------------------------------------
# パーサ
# --------------------------------------------------------------------------

def _find_target_array(src):
    """`target` 配列の中身（[...] の内側）を返す。引用符付き／無しの両対応。"""
    m = re.search(r'"?target"?\s*:\s*\[', src)
    if not m:
        return None
    i = m.end() - 1
    depth = 0
    in_str = False
    quote = ""
    esc = False
    for j in range(i, len(src)):
        c = src[j]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == quote:
                in_str = False
            continue
        if c in "\"'":
            in_str = True
            quote = c
            continue
        if c == "[":
            depth += 1
        elif c == "]":
            depth -= 1
            if depth == 0:
                return src[i:j + 1]
    return None


def _parse_objects(block):
    """{...} の並びを、キーの引用符有無に関わらず dict のリストへ。"""
    out = []
    for om in re.finditer(r"\{[^{}]*\}", block):
        obj = {}
        for km in re.finditer(
                r'["\']?([A-Za-z_][A-Za-z0-9_]*)["\']?\s*:\s*'
                r'(?:"((?:[^"\\]|\\.)*)"|\'((?:[^\'\\]|\\.)*)\'|(null|true|false|-?\d+))',
                om.group(0)):
            key = km.group(1)
            if km.group(2) is not None:
                val = km.group(2)
            elif km.group(3) is not None:
                val = km.group(3)
            else:
                raw = km.group(4)
                val = None if raw == "null" else raw
            obj[key] = val
        if obj:
            out.append(obj)
    return out


def parse_file(path):
    """(tokens, shape) を返す。tokens = [(word, shown, is_blank), ...]"""
    src = io.open(path, encoding="utf-8").read()

    block = _find_target_array(src)
    if block:
        tokens = []
        for o in _parse_objects(block):
            if "w" not in o:
                continue
            word = o["w"]
            ans = o.get("a", None)
            shown = o.get("s", None)
            is_blank = ans is not None and shown is not None
            tokens.append((word, shown if is_blank else None, is_blank))
        if tokens:
            return tokens, "target"

    m = re.search(r"\bblanks\s*=\s*\[", src)
    if m:
        i = m.end() - 1
        depth = 0
        end = len(src)
        for j in range(i, len(src)):
            if src[j] == "[":
                depth += 1
            elif src[j] == "]":
                depth -= 1
                if depth == 0:
                    end = j + 1
                    break
        tokens = []
        for o in _parse_objects(src[i:end]):
            if "given" in o and "answer" in o:
                given = o["given"] or ""
                tokens.append((given + (o["answer"] or ""), given, True))
        if tokens:
            return tokens, "blanks"

    return [], "unknown"


# --------------------------------------------------------------------------
# 検証
# --------------------------------------------------------------------------

def check_file(path):
    rel = os.path.relpath(path, REPO)
    tokens, shape = parse_file(path)
    problems = []

    if shape == "unknown" or not tokens:
        return rel, shape, ["データを解析できませんでした（形式が想定外）"]

    blanks = [(w, s) for (w, s, b) in tokens if b]

    for word, shown in blanks:
        n = len(word)
        exp = n // 2
        if len(shown) != exp:                                    # R1
            problems.append(
                'R1 floor(n/2): "%s"(n=%d) 表示=%d 期待=%d  [%s|%s]'
                % (word, n, len(shown), exp, shown, word[len(shown):]))
        if n < 2:                                                # R2
            problems.append('R2 最小長: "%s" は 1 文字なので空所にできない' % word)
        if re.search(r"\s", word):                               # R5
            problems.append('R5 空白混入: "%s" に空白が含まれる（複数語は不可）' % word)

    if shape == "target":                                        # R3
        flags = [b for (_w, _s, b) in tokens]
        for i in range(len(flags) - 1):
            if flags[i] and flags[i + 1]:
                problems.append(
                    "R3 厳密交互: トークン %d と %d が連続して空所（隣接禁止）"
                    % (i + 1, i + 2))
        if len(tokens) != 20:                                    # R4
            problems.append("R4 件数: target トークンが %d 個（20 個であるべき）"
                            % len(tokens))

    if len(blanks) != 10:                                        # R4
        problems.append("R4 件数: 空所が %d 個（10 個であるべき）" % len(blanks))

    return rel, shape, problems


def collect():
    seen = set()
    results = []
    for pat in TARGET_GLOBS:
        for path in sorted(glob.glob(os.path.join(REPO, pat))):
            if any(x in path.replace(os.sep, "/") for x in EXCLUDE_PARTS):
                continue
            if path in seen:
                continue
            seen.add(path)
            results.append(check_file(path))
    return results


def load_baseline():
    if not os.path.exists(BASELINE_PATH):
        return {}
    try:
        with io.open(BASELINE_PATH, encoding="utf-8") as f:
            return json.load(f).get("known_violations", {})
    except Exception as err:
        print("ベースラインを読めません: %s" % err)
        return {}


def save_baseline(results):
    known = {}
    for rel, _shape, problems in results:
        if problems:
            known[rel] = len(problems)
    payload = {
        "_comment": [
            "CTW 仕様(v3.5.2)の既知の逸脱を凍結したベースライン。",
            "practice-test/ 配下は v3.5.2 制定(2026-07-02, #124/#125)より前に",
            "作られたまま残っており、answer/blanks を修正すると CLAUDE.md の",
            "旧版アーカイブ＋era 境界の手続きが必要になるため据え置いている。",
            "件数が増えたら CI が落ちる。減らしたら",
            "  python3 tools/check-ctw.py --update-baseline",
            "でこのファイルを更新すること。新規ファイルは 0 件が必須。",
        ],
        "known_violations": known,
    }
    with io.open(BASELINE_PATH, "w", encoding="utf-8") as f:
        f.write(json.dumps(payload, ensure_ascii=False, indent=2,
                           sort_keys=True) + u"\n")


def main():
    args = sys.argv[1:]
    mode_check = "--check" in args
    mode_strict = "--strict" in args
    mode_update = "--update-baseline" in args

    results = collect()
    if not results:
        print("CTW ファイルが1つも見つかりませんでした。glob 設定を確認してください。")
        return 1

    total = sum(len(p) for _r, _s, p in results)

    if mode_update:
        save_baseline(results)
        print("ベースラインを更新しました: %s" % os.path.relpath(BASELINE_PATH, REPO))
        print("  逸脱のあるファイル: %d / %d、合計 %d 件"
              % (len([1 for _r, _s, p in results if p]), len(results), total))
        return 0

    if not mode_check:
        for rel, shape, problems in results:
            mark = "NG" if problems else "ok"
            print("[%s] %s  (%s, %d 件)" % (mark, rel, shape, len(problems)))
            for p in problems:
                print("      - %s" % p)
        print("\n合計 %d 件の逸脱 / %d ファイル" % (total, len(results)))
        return 0

    # ---- CI モード ----
    baseline = {} if mode_strict else load_baseline()
    failures = []
    improved = []

    for rel, _shape, problems in results:
        allowed = baseline.get(rel, 0)
        got = len(problems)
        if got > allowed:
            failures.append((rel, allowed, got, problems))
        elif got < allowed:
            improved.append((rel, allowed, got))

    if failures:
        print("NG CTW 仕様チェックに失敗しました\n")
        for rel, allowed, got, problems in failures:
            if allowed == 0:
                print("  %s: 逸脱 %d 件（このファイルは 0 件でなければなりません）"
                      % (rel, got))
            else:
                print("  %s: 逸脱 %d 件（ベースラインは %d 件。増えています）"
                      % (rel, got, allowed))
            for p in problems[:8]:
                print("      - %s" % p)
            if len(problems) > 8:
                print("      … 他 %d 件" % (len(problems) - 8))
        print("")
        print("直し方:")
        print("  空所は「表示＝先頭 floor(n/2) 文字」で機械的に決まります。")
        print("  例: len=8 の語なら先頭 4 文字を見せて残り 4 文字を空所にする。")
        print("  手で調整しないでください（.claude/commands/new-ctw.md 参照）。")
        print("  詳細は python3 tools/check-ctw.py で確認できます。")
        return 1

    if improved:
        print("改善を検出しました（CI は通します）:")
        for rel, allowed, got in improved:
            print("  %s: %d → %d 件" % (rel, allowed, got))
        print("  python3 tools/check-ctw.py --update-baseline "
              "でベースラインを更新してください。")

    print("OK CTW 仕様チェック通過（%d ファイル、既知の逸脱 %d 件は据え置き）"
          % (len(results), total))
    return 0


if __name__ == "__main__":
    sys.exit(main())
