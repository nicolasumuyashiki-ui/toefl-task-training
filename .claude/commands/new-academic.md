Read an Academic Passage の新しい問題セットを作成してください。

## 事前準備（自動実行）
1. `docs/topic-history.md` を読み、Academic Passageセクションの使用済みトピックを確認する
2. `reading/academic/` フォルダ内の既存ファイルを確認し、次のPractice番号を特定する
3. 使用済みトピックと重複しないテーマを2つ選定する（Standard + Harder Module）
4. 既存の `reading/academic/practice-1.html` を読み、HTML/CSS/JS構造を踏襲する

## 指定
$ARGUMENTS
- 例: `photosynthesis, ocean currents` → Standard / Harder のトピック指定
- 例: `random` or 空 → 全てランダム生成

## 出力ファイル
1. `reading/academic/practice-{N}.html` — 問題ページHTML（2パッセージ分）
2. `reading/academic/practice-{N}-answers.html` — 解答解説ページ

## Academic Passage 問題仕様

### 概要
- 1 Practice = 2つのアカデミックパッセージ（Standard + Harder Module）
- 各パッセージ2問 = 計4問
- Split layout: 左パネル（パッセージ）+ 右パネル（問題1問ずつ）
- 制限時間: 25分（全問共有タイマー、sessionStorageで永続化）

### パッセージ作成ルール
- **Passage 1 (Standard)**: 300-350語、CEFR B1-B2、身近な学術トピック
- **Passage 2 (Harder Module)**: 350-400語、CEFR B2-C1、専門性の高いトピック
- 3-4段落構成（導入→詳細→展開→結論）
- 各段落に `<p>` タグ、最後のパッセージの段落に `id="insertionParagraph"`（Sentence Insertion用）

### 問題タイプ（4問で以下から選択、重複最小限に）
- **Main Idea**: パッセージ全体の主旨を問う
- **Factual Information**: パッセージ中の具体的事実を問う
- **Vocabulary in Context**: 文脈中の語の意味を問う（ターゲット語は `.highlight-word` でハイライト）
- **Inference**: パッセージから推測できることを問う
- **Sentence Insertion**: パッセージ内の適切な位置に文を挿入する（特殊UIあり）

### Sentence Insertion 問題の仕様（使用する場合）
- パッセージ内に4つの挿入候補位置（A/B/C/D）を `<span class="insert-square" data-insert="X">&#9632;</span>` で表示
- 挿入文は問題文に明示
- 正解は1箇所のみ（discourse markers や代名詞参照で一意に特定できること — CLAUDE.md参照）
- 選択するとパッセージが再構築され、挿入文が表示される

### 選択肢ルール
- 各問題4択（A-D）
- 各選択肢 5-15語
- 正解分布: できるだけ均等に
- Vocabulary問題: 選択肢は単語または短いフレーズ

### HTML構造（既存踏襲 — 必ず practice-1.html を参照）
- トップナビ: `Question X of 20` / タイマー / Review / ユーザーバッジ
- プログレスバー
- Split layout: `.passage-panel`（左）+ `.question-panel`（右）
- パッセージ: `.passage-title` + `.passage-content` > `<p>` 段落
- Sentence Insertion: `updateParagraphVersion()` で通常表示と挿入モードを切替
- 問題: `.question-page` を1問ずつ active/inactive
- 選択肢: `.option` div（radio hidden）
- Insert squares: `.insert-square` + `.selected-square`
- フッター: Back / Next ボタン（最終問で「Finish ›」）
- Reviewオーバーレイ

### JS機能（既存踏襲）
- `selectOption(el)`: 選択肢の選択・保存
- `changePage(dir)`: ページ遷移 + パッセージ切替
- `updateParagraphVersion()`: 挿入問題のUI切替
- `bindSquareClicks()`: 挿入位置の選択ハンドラ
- `rebuildParagraphWithInsertion(pos)`: パッセージ再構築
- sessionStorage: `kickstart_academic_p{N}_answers` にJSON保存
- タイマー: `kickstart_reading_timer` で全Reading問題共有

### 解答ページ（practice-{N}-answers.html）
- ヘッダー: ダーク背景にタイトル + パッセージ名
- スコアバナー: X/4
- Tips セクション（パラフレーズ、構造理解、推論の根拠確認）
- 各問題カード: `.q-card.correct` or `.q-card.incorrect`
  - 問題タイプ表示（Main Idea / Factual / Vocabulary / Inference / Insertion）
  - 正解タグ、ユーザー回答タグ
  - 4択すべて表示（正解✓、誤選択は取り消し線）
  - 詳細解説（日本語）

### 検証チェックリスト
- [ ] Passage 1: 300-350語、Standard難易度
- [ ] Passage 2: 350-400語、Harder Module難易度
- [ ] 4問が異なる問題タイプ（最低3種類）
- [ ] Sentence Insertion使用時: 正解位置が一意（discourse markers/代名詞で特定可能）
- [ ] Vocabulary問題使用時: ターゲット語が `.highlight-word` でハイライト
- [ ] 選択肢が5-15語で均一長
- [ ] 正解が明確に1つだけ
- [ ] 過去セットとトピック重複なし

## 作成後
1. HTML問題ページ + 解答ページを作成
2. `docs/topic-history.md` のAcademic Passageセクションにトピック追記
3. 検証サマリーを表示:
   - 各パッセージの語数と難易度
   - 問題タイプ分布
   - 選択肢語数チェック
   - Sentence Insertion一意性確認（該当時）
   - 正解の一意性確認
   - 過去セットとの重複なし確認
