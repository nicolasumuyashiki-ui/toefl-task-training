#!/usr/bin/env python3
"""
未定義識別子ガード — 「保存が静かに死ぬ」事故の再発防止

■ なぜ必要か（2026-08-05 の事故）
writing/discussion/practice-{1..10}.html の finishWriting() が、
Api.saveAnswers に渡す引数で未宣言の `wordCount` を参照していた
（正しくは同関数内の `wc`）。未宣言変数の読み取りは ReferenceError を
投げるため、引数オブジェクトの評価時点で例外が発生し、
Api.saveAnswers は一度も呼ばれていなかった。しかも周囲の

    try{ Api.saveAnswers(...) }catch(e){}

が例外を握り潰していたため、画面上は正常に完了したように見え、
#111（2026-06-28）から発覚まで誰も気づかなかった。
Discussion は auth.js の AUTO_SAVE_LABELS に含まれない（自前保存が前提）
ため、フォールバックもなく、全10 Practice の提出がサーバ ANSWERS に
一切保存されていなかった。

■ このツール
全 HTML のインライン <script> を走査し、「そのファイルのどのスコープにも
宣言が存在しない識別子の参照」を検出する。スコープは意図的に
over-approximate（ファイル全体を1スコープとみなす）ので、
スコープ跨ぎによる誤検知は出ない。`wordCount` のような
「どこにも存在しない名前」だけを確実に拾う。

握り潰される try/catch の中にあっても、静的解析なので必ず見つかる。

■ 使い方
    python3 tools/check-js-undefined.py            # 全体を検査（baseline 差分のみ失敗）
    python3 tools/check-js-undefined.py --all      # baseline を無視して全件表示
    python3 tools/check-js-undefined.py --update-baseline

baseline（tools/js-undefined-baseline.json）には、発見済みで未修正の
既知事象を記録する。CI は baseline に無い**新規**の未定義参照だけで落ちる
ので、既存の負債を抱えたままでも新しい事故は止められる。
baseline を増やすときは、なぜ許容するのかを PR で説明すること。
"""

import json
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASELINE = os.path.join(REPO, 'tools', 'js-undefined-baseline.json')

# ブラウザ/実行環境が提供するもの、および共有 js/*.js が定義するもの。
KNOWN_GLOBALS = set("""
window document console JSON Math String Number Boolean Array Object Date RegExp Error TypeError
sessionStorage localStorage location navigator history screen alert confirm prompt
setTimeout setInterval clearInterval clearTimeout requestAnimationFrame cancelAnimationFrame
parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent escape unescape
fetch Promise Symbol Map Set WeakMap WeakSet Proxy Reflect Intl BigInt globalThis
Audio Image FormData Blob File FileReader URL URLSearchParams XMLHttpRequest Headers Request Response
MutationObserver IntersectionObserver ResizeObserver CustomEvent Event KeyboardEvent MouseEvent
DragEvent DataTransfer Node Element HTMLElement DocumentFragment Range Selection
MediaRecorder MediaStream AudioContext webkitAudioContext speechSynthesis SpeechSynthesisUtterance
getComputedStyle btoa atob structuredClone performance crypto matchMedia queueMicrotask
Uint8Array Int8Array Uint16Array Int16Array Uint32Array Int32Array Float32Array Float64Array
ArrayBuffer DataView TextEncoder TextDecoder AbortController WebSocket Worker Notification
undefined NaN Infinity arguments eval
Api Auth TCKProgress TCKAttempt TCKDifficulty TCKRecorder TCKHistory
""".split())

KEYWORDS = set("""
if else for while do switch case default break continue return function var let const
new typeof instanceof in of delete void throw try catch finally class extends super
yield await async this true false null get set static
""".split())

# ---------------------------------------------------------------- tokenizer
# 文字列・テンプレート・コメント・正規表現リテラルを正しく読み飛ばし、
# 「コード上の識別子」だけを取り出す。regex の混入で英単語が識別子として
# 誤検出されるのを防ぐため、除算との区別も行う。

_ID_START = re.compile(r'[A-Za-z_$]')
_ID_PART = re.compile(r'[\w$]')

# この直後の `/` は正規表現リテラルの開始とみなす（除算ではない）
_REGEX_OK_AFTER = KEYWORDS - {'this', 'true', 'false', 'null', 'super'}


def tokenize(src):
    """(kind, value, pos) を順に返す。kind は 'id' | 'punct' | 'other'。"""
    i, n = 0, len(src)
    prev_kind, prev_val = None, None
    while i < n:
        c = src[i]
        # コメント
        if c == '/' and i + 1 < n and src[i + 1] == '/':
            j = src.find('\n', i)
            i = n if j < 0 else j
            continue
        if c == '/' and i + 1 < n and src[i + 1] == '*':
            j = src.find('*/', i + 2)
            i = n if j < 0 else j + 2
            continue
        # 文字列
        if c in '"\'':
            j = i + 1
            while j < n:
                if src[j] == '\\':
                    j += 2
                    continue
                if src[j] == c:
                    break
                j += 1
            i = j + 1
            prev_kind, prev_val = 'other', None
            continue
        # テンプレートリテラル（${ } の中はコードなので再帰的に処理）
        if c == '`':
            j, depth = i + 1, 0
            while j < n:
                if src[j] == '\\':
                    j += 2
                    continue
                if src[j] == '$' and j + 1 < n and src[j + 1] == '{':
                    k, d = j + 2, 1
                    while k < n and d:
                        if src[k] == '{':
                            d += 1
                        elif src[k] == '}':
                            d -= 1
                        k += 1
                    for t in tokenize(src[j + 2:k - 1]):
                        yield (t[0], t[1], j + 2 + t[2])
                    j = k
                    continue
                if src[j] == '`':
                    break
                j += 1
            i = j + 1
            prev_kind, prev_val = 'other', None
            continue
        # 正規表現リテラル
        if c == '/':
            regex_ok = (
                prev_kind is None
                or (prev_kind == 'punct' and prev_val not in (')', ']', '}'))
                or (prev_kind == 'id' and prev_val in _REGEX_OK_AFTER)
            )
            if regex_ok:
                j, in_class = i + 1, False
                while j < n:
                    ch = src[j]
                    if ch == '\\':
                        j += 2
                        continue
                    if ch == '[':
                        in_class = True
                    elif ch == ']':
                        in_class = False
                    elif ch == '/' and not in_class:
                        break
                    elif ch == '\n':
                        break
                    j += 1
                j += 1
                while j < n and _ID_PART.match(src[j]):  # フラグ
                    j += 1
                i = j
                prev_kind, prev_val = 'other', None
                continue
        # 識別子
        if _ID_START.match(c):
            j = i
            while j < n and _ID_PART.match(src[j]):
                j += 1
            val = src[i:j]
            yield ('id', val, i)
            prev_kind, prev_val = 'id', val
            i = j
            continue
        # 数値
        if c.isdigit():
            j = i
            while j < n and (src[j].isalnum() or src[j] in '._'):
                j += 1
            i = j
            prev_kind, prev_val = 'other', None
            continue
        if not c.isspace():
            yield ('punct', c, i)
            prev_kind, prev_val = 'punct', c
        i += 1


# ---------------------------------------------------------------- analysis

def inline_scripts(html):
    out = []
    for m in re.finditer(r'<script(?![^>]*\bsrc=)([^>]*)>(.*?)</script>', html, re.S | re.I):
        attrs = m.group(1) or ''
        t = re.search(r'type\s*=\s*["\']([^"\']+)', attrs)
        if t and t.group(1).lower() not in ('text/javascript', 'application/javascript', 'module'):
            continue
        out.append((m.group(2), html[:m.start()].count('\n') + 1))
    return out


def analyze(tokens):
    """宣言名・typeof ガード名・参照 を返す。"""
    declared, guarded, refs = set(), set(), []
    toks = list(tokens)
    for idx, (kind, val, pos) in enumerate(toks):
        if kind != 'id':
            continue

        def nxt(k=1):
            return toks[idx + k] if idx + k < len(toks) else ('', '', -1)

        def prv(k=1):
            return toks[idx - k] if idx - k >= 0 else ('', '', -1)

        # 宣言: var/let/const は次以降の識別子を , 区切りで拾う（分割代入含む）
        if val in ('var', 'let', 'const'):
            j, depth = idx + 1, 0
            while j < len(toks):
                k2, v2, _ = toks[j]
                if k2 == 'punct':
                    if v2 in '([{':
                        depth += 1
                    elif v2 in ')]}':
                        if depth == 0:
                            break
                        depth -= 1
                    elif v2 == ';' and depth == 0:
                        break
                    elif v2 == '=' and depth == 0:
                        # 初期化子は読み飛ばす（次の , か ; まで）
                        d2 = 0
                        while j < len(toks):
                            kk, vv, _ = toks[j]
                            if kk == 'punct':
                                if vv in '([{':
                                    d2 += 1
                                elif vv in ')]}':
                                    if d2 == 0:
                                        break
                                    d2 -= 1
                                elif (vv == ',' or vv == ';') and d2 == 0:
                                    break
                            j += 1
                        continue
                elif k2 == 'id' and v2 not in KEYWORDS:
                    declared.add(v2)
                j += 1
            continue

        if val in ('function', 'class'):
            k2, v2, _ = nxt()
            if k2 == 'id' and v2 not in KEYWORDS:
                declared.add(v2)
            continue

        if val == 'catch':
            if nxt()[1] == '(' and nxt(2)[0] == 'id':
                declared.add(nxt(2)[1])
            continue

        if val == 'typeof':
            if nxt()[0] == 'id':
                guarded.add(nxt()[1])
            # typeof されたものは参照として数えない
            continue

        if val in KEYWORDS:
            continue

        # window.X = ... で作られるグローバル（プロパティ判定より先に見る）
        if prv(2)[1] == 'window' and prv()[1] == '.' and nxt()[1] == '=' and nxt(2)[1] != '=':
            declared.add(val)
            continue

        # 直前が `.` ならプロパティアクセス、直後が `:` ならオブジェクトキー
        if prv()[0] == 'punct' and prv()[1] == '.':
            continue
        if nxt()[0] == 'punct' and nxt()[1] == ':':
            continue
        # 暗黙のグローバル / 代入で作られる名前
        if nxt()[0] == 'punct' and nxt()[1] == '=' and nxt(2)[1] != '=':
            declared.add(val)

        refs.append((val, pos))

    return declared, guarded, refs


def collect_params(toks):
    """function(...) / catch(...) / (…) => の引数名を宣言として拾う。"""
    names = set()
    for idx, (kind, val, pos) in enumerate(toks):
        if kind == 'id' and val == 'function':
            j = idx + 1
            while j < len(toks) and toks[j][1] != '(':
                j += 1
            depth = 0
            while j < len(toks):
                k2, v2, _ = toks[j]
                if v2 == '(':
                    depth += 1
                elif v2 == ')':
                    depth -= 1
                    if depth == 0:
                        break
                elif k2 == 'id' and v2 not in KEYWORDS:
                    names.add(v2)
                j += 1
        # アロー関数: ident =>   /   ( a, b ) =>
        if kind == 'punct' and val == '=' and idx + 1 < len(toks) and toks[idx + 1][1] == '>':
            j = idx - 1
            if j >= 0 and toks[j][0] == 'id':
                names.add(toks[j][1])
            elif j >= 0 and toks[j][1] == ')':
                depth = 0
                while j >= 0:
                    k2, v2, _ = toks[j]
                    if v2 == ')':
                        depth += 1
                    elif v2 == '(':
                        depth -= 1
                        if depth == 0:
                            break
                    elif k2 == 'id' and v2 not in KEYWORDS:
                        names.add(v2)
                    j -= 1
    return names


def scan_file(path):
    html = open(path, encoding='utf-8', errors='replace').read()
    blocks = inline_scripts(html)
    if not blocks:
        return []
    declared, guarded, refs = set(), set(), []
    for body, line in blocks:
        toks = list(tokenize(body))
        d, g, r = analyze(toks)
        declared |= d | collect_params(toks)
        guarded |= g
        for name, pos in r:
            refs.append((name, line + body[:pos].count('\n')))
    out, seen = [], set()
    for name, line in refs:
        if name in KNOWN_GLOBALS or name in declared or name in guarded or name in seen:
            continue
        seen.add(name)
        out.append({'file': os.path.relpath(path, REPO).replace(os.sep, '/'),
                    'name': name, 'line': line})
    return out


def scan_repo(root):
    found = []
    for base, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in ('.git', 'node_modules')]
        for fn in sorted(files):
            if fn.endswith('.html'):
                found += scan_file(os.path.join(base, fn))
    return sorted(found, key=lambda x: (x['file'], x['name']))


def key(item):
    return f"{item['file']}::{item['name']}"


def main():
    args = sys.argv[1:]
    show_all = '--all' in args
    update = '--update-baseline' in args

    found = scan_repo(REPO)

    if update:
        with open(BASELINE, 'w', encoding='utf-8') as f:
            json.dump({'_comment': '既知・未修正の未定義参照。CI はこれに無い新規のみで落ちる。'
                                   ' 減らすのが正、増やすときは PR で理由を書くこと。',
                       'known': [key(i) for i in found]}, f, ensure_ascii=False, indent=2)
            f.write('\n')
        print(f'baseline を更新しました: {len(found)} 件')
        return 0

    baseline = set()
    if os.path.exists(BASELINE):
        with open(BASELINE, encoding='utf-8') as f:
            baseline = set(json.load(f).get('known', []))

    new = [i for i in found if key(i) not in baseline]

    print(f'走査結果: 未定義参照 {len(found)} 件（うち baseline 既知 {len(found) - len(new)} 件）')

    if show_all:
        for i in found:
            mark = '既知' if key(i) in baseline else '新規'
            print(f"  [{mark}] {i['file']}:{i['line']}  `{i['name']}`")

    fixed = baseline - {key(i) for i in found}
    if fixed:
        print(f'\n✅ baseline から解消された項目が {len(fixed)} 件あります。'
              f' `python3 tools/check-js-undefined.py --update-baseline` で baseline を縮めてください:')
        for k in sorted(fixed):
            print(f'    {k}')

    if not new:
        print('\n✅ 新規の未定義参照はありません。')
        return 0

    print(f'\n❌ 新規の未定義参照が {len(new)} 件あります。')
    for i in new:
        print(f"    {i['file']}:{i['line']}  未定義: `{i['name']}`")
    print("""
直し方:
  その名前が「打ち間違い」なら正しい変数名に直す（例: wordCount -> wc）。
  意図的に存在しないかもしれないものを触るなら typeof ガードを付ける。
      if (typeof Foo !== 'undefined') { ... }
  外部スクリプトが定義するグローバルなら KNOWN_GLOBALS に追加する。

なぜ落とすのか:
  未宣言変数の読み取りは ReferenceError になる。Api.saveAnswers(...) の
  引数の中で起きると saveAnswers 自体が呼ばれず、周囲の try/catch が
  例外を握り潰すため、画面上は正常に見えたまま履歴だけがサーバに
  残らない。実際に Discussion 全10 Practice で 2026-06-28 から
  2026-08-05 まで発生した。詳細は CLAUDE.md「履歴は絶対にリセットしない」。
""")
    return 1


if __name__ == '__main__':
    sys.exit(main())
