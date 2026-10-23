#!/usr/bin/env python3
"""保存呼び出しの静的検証 — 「保存が静かに失敗する」事故の再発防止。

背景（2026-08-19 発覚）:
  writing/discussion/practice-{1..10}.html は finishWriting() の中で
      Api.saveAnswers("Discussion PN", {text:text, words:wordCount, ...}, ...)
  と書いていたが、実際に定義されている変数は `wc` で `wordCount` は存在しなかった。
  引数のオブジェクトを組み立てる時点で ReferenceError になり、呼び出しは
  try{...}catch(e){} に飲み込まれて **一度も保存が実行されないまま 7 週間**（2026-06-28
  の 53460a6 以降）気づかれなかった。sessionStorage には残るので画面上は正常に見え、
  tck_done_* も立つため「提出済み」と表示され、発見が遅れた。

このスクリプトは全 HTML の保存呼び出しを走査し、引数の中で参照されている識別子が
その場で解決できるか（宣言済み・要素 id・window ガード付き・既知のグローバル）を検証する。
CI で落とすことで、保存が静かに壊れた状態がマージされるのを防ぐ。

使い方:
    python3 tools/check-save-calls.py          # リポジトリ全体を検証
    python3 tools/check-save-calls.py --list   # 検出した保存呼び出しを一覧表示
"""
import os
import re
import sys

# 監視対象 — 学習者のデータをサーバへ送る呼び出し
WATCHED_CALLS = (
    'Api.saveAnswers',
    'Api.savePtResult',
    'Api.saveProgress',
    'Auth.completeSet',
)

CALL_RE = re.compile(r'\b(' + '|'.join(re.escape(c) for c in WATCHED_CALLS) + r')\s*\(')

# 実行環境が用意する名前。ここに無い＝そのファイル内で宣言が要る。
AMBIENT = set("""
window document navigator location history screen console
localStorage sessionStorage JSON Math Date String Number Boolean Array Object RegExp Error
Promise Map Set WeakMap Symbol Intl fetch XMLHttpRequest FormData Blob URL
setTimeout setInterval clearTimeout clearInterval requestAnimationFrame
parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent encodeURI decodeURI
alert confirm prompt escape unescape btoa atob
true false null undefined NaN Infinity this arguments
typeof instanceof in of new delete void return function var let const class extends super
if else for while do switch case break continue try catch finally throw yield await async
Api Auth TCKProgress TCKAttempt TCKLang
""".split())


def strip_strings(s, placeholder=True):
    """文字列リテラルを潰す。中の識別子を変数参照と誤認しないため。"""
    out, i, n = [], 0, len(s)
    while i < n:
        c = s[i]
        if c in '"\'`':
            quote, i = c, i + 1
            while i < n:
                if s[i] == '\\':
                    i += 2
                    continue
                if s[i] == quote:
                    i += 1
                    break
                i += 1
            out.append('""' if placeholder else '')
        else:
            out.append(c)
            i += 1
    return ''.join(out)


def scripts_of(src):
    """<script> ... </script> の中身だけを返す（インライン JS のみ検証する）。"""
    return re.findall(r'<script\b[^>]*>(.*?)</script>', src, re.S | re.I)


def declared_names(js):
    """インライン JS の中で宣言されている名前を集める（ファイル全体をひとつのスコープとみなす）。

    実際の JS より緩い（ブロックスコープを無視する）が、目的は
    「どこにも存在しない名前」を捕まえることなので、緩い側に倒すのが正しい。
    """
    names = set()

    # var a=1, b=[], c=0;  形式の複数宣言をまとめて拾う
    for m in re.finditer(r'\b(?:var|let|const)\s+([^;\n]+)', js):
        decl = m.group(1)
        depth = 0
        buf = []
        parts = []
        for ch in decl:
            if ch in '([{':
                depth += 1
            elif ch in ')]}':
                depth -= 1
            if ch == ',' and depth <= 0:
                parts.append(''.join(buf))
                buf = []
            else:
                buf.append(ch)
        parts.append(''.join(buf))
        for p in parts:
            head = p.split('=')[0].strip()
            if re.fullmatch(r'[A-Za-z_$][\w$]*', head):
                names.add(head)
            else:  # 分割代入 const {a,b}=… / const [a,b]=…
                for ident in re.findall(r'[A-Za-z_$][\w$]*', head):
                    names.add(ident)

    for m in re.finditer(r'\bfunction\s*\*?\s*([A-Za-z_$][\w$]*)', js):
        names.add(m.group(1))
    for m in re.finditer(r'\bfunction\s*\*?\s*[A-Za-z_$\w$]*\s*\(([^)]*)\)', js):
        for p in m.group(1).split(','):
            head = p.strip().split('=')[0].strip().lstrip('.')
            if re.fullmatch(r'[A-Za-z_$][\w$]*', head):
                names.add(head)
    for m in re.finditer(r'\(([^()]*)\)\s*=>', js):
        for p in m.group(1).split(','):
            head = p.strip().split('=')[0].strip().lstrip('.')
            if re.fullmatch(r'[A-Za-z_$][\w$]*', head):
                names.add(head)
    for m in re.finditer(r'(?:^|[^\w$.])([A-Za-z_$][\w$]*)\s*=>', js):
        names.add(m.group(1))
    for m in re.finditer(r'\bcatch\s*\(\s*([A-Za-z_$][\w$]*)', js):
        names.add(m.group(1))
    for m in re.finditer(r'\bfor\s*\(\s*(?:var|let|const)?\s*([A-Za-z_$][\w$]*)\s+(?:of|in)\b', js):
        names.add(m.group(1))
    # 暗黙のグローバル代入 foo = ... （宣言なし代入。行儀は悪いが実在はする）
    for m in re.finditer(r'(?:^|[;{}\n])\s*([A-Za-z_$][\w$]*)\s*=[^=]', js):
        names.add(m.group(1))
    # window.foo = ... で生やす形
    for m in re.finditer(r'\bwindow\.([A-Za-z_$][\w$]*)\s*=', js):
        names.add(m.group(1))
    return names


def element_ids(src):
    """id="x" は window.x として参照できる（ブラウザの named access）。"""
    return set(re.findall(r'\bid="([A-Za-z_$][\w$-]*)"', src))


def guarded_names(js):
    """`window.Foo ? Foo... ` / `typeof Foo !== 'undefined'` でガードされた名前。

    ガードされていれば未定義でも ReferenceError にならないので許容する。
    """
    names = set()
    for m in re.finditer(r'\bwindow\.([A-Za-z_$][\w$]*)', js):
        names.add(m.group(1))
    for m in re.finditer(r'\btypeof\s+([A-Za-z_$][\w$]*)', js):
        names.add(m.group(1))
    return names


def find_call_end(s, open_paren):
    depth, i, n = 0, open_paren, len(s)
    in_str = None
    while i < n:
        c = s[i]
        if in_str:
            if c == '\\':
                i += 2
                continue
            if c == in_str:
                in_str = None
        elif c in '"\'`':
            in_str = c
        elif c == '(':
            depth += 1
        elif c == ')':
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return -1


def check_file(path):
    """(problems, call_count) を返す。"""
    with open(path, encoding='utf-8', errors='replace') as fh:
        src = fh.read()
    if not CALL_RE.search(src):
        return [], 0

    js_all = '\n'.join(scripts_of(src)) or src
    known = declared_names(js_all) | element_ids(src) | guarded_names(js_all) | AMBIENT

    problems, count = [], 0
    for m in CALL_RE.finditer(src):
        open_paren = m.end() - 1
        end = find_call_end(src, open_paren)
        if end < 0:
            continue
        count += 1
        call = src[open_paren:end]
        body = strip_strings(call)
        # オブジェクトのキー（key:）とプロパティ参照（.foo）は変数参照ではない
        body = re.sub(r'[A-Za-z_$][\w$]*\s*:', '', body)
        body = re.sub(r'\.\s*[A-Za-z_$][\w$]*', '', body)
        line = src.count('\n', 0, open_paren) + 1
        for ident in sorted(set(re.findall(r'\b([A-Za-z_$][\w$]*)\b', body))):
            if ident in known:
                continue
            problems.append((path, line, m.group(1), ident))
    return problems, count


def main():
    show_list = '--list' in sys.argv
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root)

    all_problems, total_calls, files_with_calls = [], 0, 0
    for dirpath, dirnames, filenames in os.walk('.'):
        dirnames[:] = [d for d in dirnames if d not in ('.git', 'node_modules')]
        for fn in sorted(filenames):
            if not fn.endswith('.html'):
                continue
            path = os.path.join(dirpath, fn).lstrip('./')
            problems, count = check_file(path)
            if count:
                files_with_calls += 1
                total_calls += count
                if show_list:
                    print(f'{path}: {count} 件の保存呼び出し')
            all_problems.extend(problems)

    print(f'検査対象: {files_with_calls} ファイル / {total_calls} 件の保存呼び出し')

    if all_problems:
        print('\n❌ 保存呼び出しの引数に、解決できない変数があります。')
        print('   引数の組み立て時に ReferenceError になり、try/catch に飲み込まれて')
        print('   保存が静かに失敗します（画面上は正常に見えるため発見が遅れます）。\n')
        for path, line, call, ident in all_problems:
            print(f'  {path}:{line}  {call}(…)  →  未定義の変数: {ident}')
        print('\n直し方: その場で定義されている正しい変数名に直してください。')
        print('（例: 2026-08-19 の discussion 事故では words:wordCount → words:wc）')
        return 1

    print('✅ すべての保存呼び出しの引数が解決できます。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
