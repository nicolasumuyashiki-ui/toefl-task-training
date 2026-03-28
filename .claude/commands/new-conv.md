Listen to a Conversation の新しい問題セットを作成してください。

## 事前準備（自動実行）
1. `docs/topic-history.md` を読み、Conversationセクションの使用済みトピックを確認する
2. `day2/` フォルダ内の既存conversationファイルを確認する
3. 使用済みトピックと重複しない設定を2つ選定する

## 指定
$ARGUMENTS
- 例: `career center, chemistry lab` → 指定された設定を使用
- 例: `random` or 空 → 全てランダム生成

## 出力ファイル（Phase 1）
1. `day2/conv-scripts-{N}.md` — 録音用スクリプト＋問題＋Answer Key
2. `day2/listening-conv-{N}.html` — HTML（音声は外部参照 `conv1.wav`, `conv2.wav`）

## Conversation 問題仕様 (v1.0)

### 概要
- 2つの会話 × 各2問 = 計4問（Q9-Q12）
- 各会話: 30-40秒、6-10ターン、1ターン最大2文
- 音声再生中は画像のみ表示 → 終了後にSplit-panel（左:画像、右:問題）
- 各問題20秒カウントダウン

### 話者と設定パターン
- 学生 + 大学職員（書店、図書館、事務局、寮、ジム等）
- 学生 + 学生（授業後、カフェ、廊下、寮のロビー等）
- 学生 + 教授/TA（オフィスアワー、研究室等）

### 問題タイプ
- Q9: Detail (B1-B2) / Q10: Detail (B1-B2)
- Q11: Inference (B2) / Q12: Inference (B2)

### 正解分布
- A=1, B=1, C=1, D=1（均等）

### 選択肢ルール
- 各選択肢 5-12語、均一長
- ダッシュ/セミコロン禁止、文末ピリオド

### 声の割り当て
Conv 1とConv 2で異なるアクセントを使用:
- British: Alice (W) + Daniel (M)
- American: Sarah (W) + Chris (M)
- Australian: Nicole (W) + Callum (M)

### 会話画像
Google Driveフォルダの画像ストック4種から、設定に合った画像を選択:
- ① 青シャツ男性+ボーダーニット女性 → 学生同士カジュアル
- ② 黒スーツ女性+グレースーツ男性 → ビジネス/フォーマル
- ③ ラグランT男性+花柄ワンピ女性 → 学生同士カジュアル
- ④ カーディガン年配男性+ブラウス女性 → 教授+学生、職員+学生

### スクリプト作成ルール
- 各問題の正解根拠を会話内に明確に含める
- 不正解のひっかけ情報も自然に含める
- フィラーは最小限、感情表現は控えめ

### HTML仕様
- 既存の listening-conv.html の構造を完全に踏襲
- 音声再生中: 左パネル100%幅、画像センター、選択肢非表示
- 音声終了後: 左右50%分割、20秒カウントダウン
- 残り5秒で赤色点滅、0秒で自動次問題
- Start Listening オーバーレイ付き
- Q12のNext → listening-announce.html
- auth.js連携

### 作成後
1. スクリプト＋問題＋Answer Keyをmdファイルに出力
2. HTML雛形を作成
3. `docs/topic-history.md` のConversationセクションに使用したトピックを追記
4. 検証サマリーを表示
