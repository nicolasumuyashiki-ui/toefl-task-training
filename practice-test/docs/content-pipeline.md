# Practice Test 問題コンテンツ追加フロー

新しい問題（Reading / Listening / Writing / Speaking）を `toefl-practice` に追加するときに必ず通すパイプライン。

---

## ソース → 検証 → コミット の 6 ステップ

```
[1] toefl-question-banks から候補問題を取得
       ↓
[2] 重複チェック（vs Task Training 既存問題）
       ↓
[3] Skill 仕様チェック（Task Training の .claude/commands/new-{task}.md 準拠）
       ↓
[4] 不備があれば修正
       ↓
[5] 最終 verify（重複 ✓ + skill ✓）
       ↓
[6] commit + push（pass のみ）
    ＋ Task Training の docs/topic-history.md にも追記
```

---

## ステップ詳細

### [1] 候補取得
- ソース: `C:\Users\umuyashikin\toefl-question-banks\` の対応フォルダ
  - `writing/email/`, `writing/discussion/`, `writing/sentence/`
  - `speaking/lr/`, `speaking/ti/`
  - `reading/`, `listening/`（必要に応じて）
- 各 `practice-N.html` と `practice-N-answers.html` をペアで取得

### [2] 重複チェック
- 比較対象: `C:\Users\umuyashikin\toefl-task-training\` の同タスクの既存問題
  - email × 10, discussion × 10, sentence × 10×10=100, etc.
- 比較観点:
  - **トピック**: 環境 / 教育 / テクノロジー / 健康 / 文化 …
  - **設定／状況**: 教授宛メール / 学生間ディスカッション / etc
  - **キーワード**: "AI", "sustainability", "remote work" など
- 重複あり → 候補から除外、別の問題を引く（or 当該問題を**書き換え**）

### [3] Skill 仕様チェック
- 仕様書: `.claude/commands/new-{task}.md`
  - `new-email.md` / `new-discussion.md` / `new-sentence.md`
  - `new-lr.md` / `new-ti.md`（Speaking）
  - **`new-ctw.md` / `new-rdl.md` / `new-academic.md`（Reading）**
- チェック項目（タスクごと）:
  - 制限時間（Email 7分 / Discussion 10分 / Sentence 6分）
  - 構造（プロンプト・選択肢・モデル解答 etc）
  - 語数 / 問題数
  - 採点ルーブリック
  - HTML テンプレート構造
- 不備あり → 修正案作成

> **⚠️ Reading（CTW/RDL/Academic）は 2026-08-07 まで本チェックの対象外だった。**
> その結果、2026-07-02 の CTW v3.5.2 制定 (#124) と全面リビルド (#125) が
> `reading/ctw/` のみを対象とし、`practice-test/` 配下の CTW 9 ファイルが
> 制定前の状態のまま取り残された（50/89 空所が floor(n/2) 逸脱）。
> **模試は「Task Training と同じ仕様書に従う」という前提が、この一覧に
> Reading が無いことで実質破られていた。** 以後 Reading も必ず含めること。
>
> CTW の空所ルール（表示＝先頭 floor(n/2) 文字・厳密交互・空所は len>=2）は
> 完全に機械判定できるため、**目視ではなく `tools/check-ctw.py` で検証する**。
> CI（`.github/workflows/ctw-spec-guard.yml`）が全 PR で自動実行し、
> 逸脱が増えるとマージを落とす。手元では:
>
> ```
> python3 tools/check-ctw.py          # 全ファイルの詳細レポート
> python3 tools/check-ctw.py --check  # CI と同じ判定
> ```

### [4] 修正適用
- skill 仕様に合わせて自動修正
- 修正できないクリティカルな不備（コンテンツ全体の作り直しレベル）→ ユーザーに報告

### [5] 最終 verify
- 修正後に重複・skill チェックを再実行
- 両方 pass を確認

### [6] commit
- toefl-practice に commit + push
- Task Training の `docs/topic-history.md` にも追加トピックを記載
  - 同じトピックを後日 Task Training に追加しないよう防止

---

## 例外運用

- **Practice Test と Task Training で意図的に同じトピックを扱いたい場合**: 重複チェックで弾かれるが、ユーザー判断で例外採用可。`docs/topic-history.md` の "intentional-duplicate" セクションに追記
- **新規トピックが question-banks に無い場合**: 新規生成（Task Training の `/new-*` skill コマンド経由）してから question-banks に格納 → このパイプラインに乗せる

---

## 自動化（subagent）

このフローは subagent で完結可能。指示テンプレ：

```
toefl-question-banks から {tasktype} の practice-{N} を取得し、
本フロー（重複チェック + skill 検証 + 修正）を通して
toefl-practice の {target_path} にポートしてください。
最終的に pass したものだけ commit + push。
```
