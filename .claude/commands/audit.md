# 朝次定期メンテナンス監査

TOEFL Reps（toefl-task-training）の朝次定期メンテナンス監査を実行します。
ユーザーは稼働中の本番アプリを使い続けているため、破壊的変更は絶対にしないこと。

## 引数（オプション）
$ARGUMENTS
- `report-only`（デフォルト）: 検出のみ、commit / push しない
- `fix`: 軽微な自動修正は即時実施

## 監査スコープ：2 層構成

### 層1: 直近7日以内に変更があったファイル — 全件監査
`git log --since="7 days ago" --name-only --pretty=format:` で変更ファイル全件を下記チェック項目で精査。

### 層2: 曜日ローテーションによる全体ディープスキャン
| 曜日 | カテゴリ |
|---|---|
| 月 | reading/（ctw / rdl / academic） |
| 火 | listening/（lcr / conv / announce / talk） |
| 水 | writing/（sentence / email / discussion） |
| 木 | speaking/（lr / ti） |
| 金 | practice-test/（模試一式） |
| 土 | js/ · css/ · admin/ · 各 menu.html・index.html などのアプリ基盤 |
| 日 | docs/ · CLAUDE.md · .claude/commands/ の仕様書と実装の整合性 |

## 準拠ルール（監査前に必ず読む）
- `CLAUDE.md`（問題数テーブル・**HTML 生成時の再発防止チェック**・禁止事項）
- `.claude/commands/` 配下の各タスク仕様書（new-{task}.md）
- `.claude/qa-checklist.md`
- `docs/` 配下の仕様書（audio-pause-spec.md, topic-history.md 等）

## チェック項目

### A. 問題内容・データ整合性
1. **データ整合性**: 練習ページの `questions` と答え合わせページの `QS/correctAnswers` の一致
2. **問題数**: 各タスクが CLAUDE.md の問題数テーブルと一致しているか
3. **重複 `id` 属性**: 解説ページの `id="card1"` 〜 等が重複していないか
   - 検証: `grep -o 'id="card[0-9]*"' file | sort | uniq -d`
4. **正解分布のバランス**: A/B/C/D が各 2-3 個程度に均等か
5. **解説の jp/en 内容ズレ**: `<span class="jp">` 内の内容が該当設問の解説になっているか（他問の解説が混入していないか）

### B. HTML 構造・UI
6. **`\u####` リテラル混入**: HTMLテキスト（script外）に Unicode escape の直書きがないか
7. **EN テキスト混入**: bilingual UI で `.jp/.en` span のペア欠落がないか
8. **lang-toggle handler 欠落**: `data-lang-btn` ボタンを持つ HTML に `setLang()` の inline JS handler があるか
   - 検証: `for f in $(grep -rl 'data-lang-btn' --include='*.html' .); do grep -q 'setLang(b.getAttribute' "$f" || echo "❌ MISSING: $f"; done`
9. **練習ページ script 読み込み順**: `<script src=".../progress.js">` が inline `<script>` より前にあるか
   - 検証: 各 practice-N.html で `mountExitButton` の行番号 > `progress.js` の行番号
10. **CTW 入力欄スペーシング CSS**: `.sh{margin-right:.22em}` / `.word-blank{margin-right:.45em}` が適用されているか
11. **CTW 入力フィルタ**: input イベントでの `[^A-Za-z]` 除去が全 CTW ファイルにあるか
12. **Build a Sentence**: 文末ピリオドが word bank の最後の piece に混入していないか

### C. 数値・タイマー・リンク
13. **リンク切れ**: `href` / `src` の参照先ファイルが実在するか
14. **表示文字列の数値矛盾**: `"of N" / "score/N"` の N が実問題数と一致するか
15. **タイマー秒数の整合**: instruction overlay の表示分数 / JS の `timeLeft` 秒数 / spec 値 の三者一致
16. **Academic Passage 挿入問題**: 正解位置が一意か（複数解釈できる挿入は要修正）
17. **altAnswers**: ある Sentence 問題で採点ロジックが altAnswers を見ているか

## 報告フォーマット

件名：【TOEFL Reps 朝次監査】YYYY-MM-DD（曜日カテゴリ：◯◯）

1. **監査サマリ**
   - 層1（直近7日変更）: N ファイル監査
   - 層2（曜日ディープスキャン）: ◯◯カテゴリ M ファイル監査

2. **【要対応・自動修正可能レベル】**
   軽微で承認不要レベル。各項目: ファイルパス・行番号・問題内容・推奨修正（1行）。
   `report-only` モードでは未修正。

3. **【要承認・判断が必要】**
   正解データ変更／問題内容変更／問題数増減／音声再生成／設計判断を伴うもの。
   各項目: ファイルパス・問題内容・選択肢（A案/B案）

4. **【異常なし】**
   チェックして問題のなかった項目のサマリ

問題ゼロの場合も「本日は異常なし」と必ず報告。

## 禁止事項
- `js/api.js` の `GAS_URL` を変更しない
- `index.html` の認証ロジックを変更しない
- 既存の問題ファイルの正解を勝手に変更しない
- `report-only` モードでは commit / push を一切行わない
- **`fix` モードで修正を実施する場合でも、生徒の受講履歴・スコアには絶対に変更を加えない**
  （localStorage `training_score_*` / `training_first_*` / `training_attempts_*` / `tck_done_*` /
  `tck_progress_*`、sessionStorage、サーバ ANSWERS / RECORDINGS / PT_RESULTS シート）。
  監査修正はタイマー値・リンク・HTML 構造・表示文字列など UI/整合性に限定し、履歴永続化コード
  （`Api.saveAnswers` 呼び出し・履歴キーの読み書き）は触れない。これは**すべての朝次監査で共通の不変ルール**。

## 過去の見落とし（チェック追加履歴）
- 2026-05-18: 項目 #8（lang-toggle handler 欠落）と #9（script 読み込み順）を追加。Academic Passage の answers ページで EN ボタンが機能しないバグ、および練習ページで progress.js が後から読み込まれフローティング UI が出ないバグを見逃したため。
- 2026-05-18: 項目 #3（重複 `id`）と #5（jp/en 内容ズレ）を追加。Academic Passage の問題数拡張作業中に判明したバグ。
