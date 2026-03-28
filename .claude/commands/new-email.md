Write an Email の新しい問題を作成してください。

## 事前準備（自動実行）
1. `docs/history-writing.md` を読み、Write an Emailセクションの使用済みトピックを確認する
2. `day3/` フォルダ内の既存write-emailファイルを確認する
3. 既存ファイルのHTML構造・CSS・JSを踏襲する

## 指定
$ARGUMENTS
- 例: `poetry magazine submission problem` → 指定シナリオ
- 例: `random` or 空 → シナリオをランダム生成

## 出力ファイル
1. `day3/write-email-{N}.html` — インタラクティブHTML
2. `day3/write-email-{N}.md` — 問題文MD

## Write an Email 問題仕様

### 概要
- 7分タイマー（自動終了）
- シナリオを読み、指定の宛先にメールを書く
- 3つのタスクポイントに対応する内容を含める
- Cut/Paste/Undo/Redo/Word Countツールバー付き

### シナリオ設定
- **場面**: アカデミック（大学、クラス）またはソーシャル（地域、サービス）
- **状況**: 具体的な問題や目的がある
- **長さ**: 2-3文程度

### タスクポイント（3つ指定）
例:
- 推薦: 理由を述べる、利点を説明、行動を勧める
- 招待: イベント詳細、参加の利点、返答を求める
- 問題解決: 問題を説明、影響を述べる、解決策を提案
- 苦情: 良い点を述べる、問題を説明、対応を求める
- 情報提供: 背景を説明、詳細を述べる、質問に答える

### メールヘッダー
- To: 適切なメールアドレス（架空OK）
- Subject: 簡潔で内容を反映した件名

### HTML仕様
- 既存の write-email.html の構造を完全に踏襲
- ヘッダー: 左「Writing」、右にタイマー(⏱️ 07:00)＋Finishボタン（赤）
- Page 0: Instruction（説明＋Start Writingボタン）
- Writing Page: 左パネル（シナリオ＋タスク）＋右パネル（メールヘッダー＋ツールバー＋テキストエリア）
- Completion Page: 終了方法に応じたアイコン（⏰ or ✅）＋回答プレビュー＋Word Count＋使用時間
- 確認モーダル: Finishクリック時に「Finish Writing?」ポップアップ
- フッター: Reset All ボタン
- 残り1分で赤色警告
- auth.js連携

### 作成後
1. HTML＋MDファイルを作成
2. `docs/history-writing.md` のWrite an Emailセクションにシナリオ追記
3. サマリー表示: シナリオ概要、タスクポイント、メールヘッダー
