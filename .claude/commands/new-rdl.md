Read in Daily Life (RDL) の新しい問題セットを作成してください。

## 事前準備（自動実行）
1. `docs/topic-history.md` を読み、RDLセクションの使用済みトピックを確認する
2. `reading/rdl/` フォルダ内の既存ファイルを確認し、次のPractice番号を特定する
3. 使用済みトピックと重複しない題材を2つ選定する
4. 既存の `reading/rdl/practice-1.html` を読み、HTML/CSS/JS構造を踏襲する

## 指定
$ARGUMENTS
- 例: `library notice, parking permit email` → 指定された題材
- 例: `random` or 空 → 全てランダム生成

## 出力ファイル
1. `reading/rdl/practice-{N}.html` — 問題ページHTML
2. `reading/rdl/practice-{N}-answers.html` — 解答解説ページ

## RDL 問題仕様

### 概要
- 1 Practice = 2つの日常的文書 × 各1問 = 計2問
- Split layout: 左パネル（文書）+ 右パネル（問題）
- 制限時間: 25分（全問共有タイマー、sessionStorageで永続化）
- CEFR B1-B2レベル

### 文書タイプ（以下から2つ選択、同じタイプは避ける）
- **メール/通知**: 大学からの公式通知、教授からのメール
- **掲示/ポスター**: キャンパス内の掲示、イベント告知
- **テキストメッセージ**: 学生同士のチャット
- **ウェブページ**: 大学サイトのFAQ、サービス案内
- **手紙/メモ**: 部署からの連絡文

### 文書のHTML表現（既存踏襲）
- **メール**: `.email-container` > `.email-subject` + `.email-meta` + `.email-body`
- **掲示**: `.notice-container` > `.notice-header` + `.notice-body`
- **テキスト**: `.phone-frame` > `.phone-screen` > `.message-thread`（リアルなスマホUI）

### 問題タイプ
- Detail（事実確認）: 文書中の具体的情報を問う
- Inference（推論）: 文書から推測できることを問う
- Purpose（目的）: 文書の意図や目的を問う
- Main Idea（主旨）: 文書全体の要点を問う
- 2問で少なくとも2つの異なるタイプを使う

### 選択肢ルール
- 各問題4択（A-D）
- 各選択肢 5-12語、均一長
- ダッシュ/セミコロンで文をつなげない
- 正解分布: できるだけ均等に

### HTML構造（既存踏襲 — 必ず practice-1.html を参照）
- トップナビ: `Question X of 20` / タイマー / Review / ユーザーバッジ
- プログレスバー
- Split layout: `.passage-panel`（左）+ `.question-panel`（右）
- 問題は1問ずつ `.question-page.active` で表示
- 選択肢: `.option` div（radio hidden、クリックで選択）
- フッター: Back / Next ボタン
- Reviewオーバーレイ: 全問の回答状況

### JS機能（既存踏襲）
- `selectOption(el)`: 選択肢の選択・保存
- `changePage(dir)`: ページ遷移
- `goNext()`: 次のファイルへ（解答ページ or 次のタスク）
- sessionStorage: `kickstart_rdl_p{N}_answers` にJSON保存
- タイマー: `kickstart_reading_timer` で全Reading問題共有

### 解答ページ（practice-{N}-answers.html）
- ヘッダー: ダーク背景にタイトル
- スコアバナー: X/2
- Tips セクション（キーワード、消去法、イディオム）
- 各問題カード: `.q-card.correct` or `.q-card.incorrect`
  - 問題文、正解タグ、ユーザー回答タグ
  - 4択すべて表示（正解✓、誤選択は取り消し線）
  - 詳細解説（日本語）

### 検証チェックリスト
- [ ] 2つの文書が異なるタイプ
- [ ] 各文書が自然で読みやすい
- [ ] 2問が異なる問題タイプ
- [ ] 選択肢が5-12語で均一長
- [ ] 正解が明確に1つだけ（他の選択肢は明確に不正解）
- [ ] 過去セットとトピック重複なし

### パラフレーズ度チェック（Detail/Inference問題に適用）
- [ ] 正解選択肢と本文の連続一致が**4語以下**か
- [ ] 本文のキーワードが同義語に置き換えられているか
- [ ] 「本文を指でなぞるだけで即答」にならない設計か

## 作成後
1. HTML問題ページ + 解答ページを作成
2. `docs/topic-history.md` のRDLセクションにトピック追記
3. 検証サマリーを表示:
   - 文書タイプ
   - 問題タイプ
   - 選択肢語数チェック
   - 正解の一意性確認
   - 過去セットとの重複なし確認
