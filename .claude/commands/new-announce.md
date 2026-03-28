Listen to an Announcement の新しい問題セットを作成してください。

## 事前準備（自動実行）
1. `docs/topic-history.md` を読み、Announcementセクションの使用済みトピックを確認する
2. `day2/` フォルダ内の既存announcementファイルを確認する
3. 使用済みトピックと重複しない設定を2つ選定する

## 指定
$ARGUMENTS
- 例: `classroom library` → 指定された場面を使用
- 例: `random` or 空 → 全てランダム生成

## 出力ファイル（Phase 1）
1. `day2/announce-scripts-{N}.md` — 録音用スクリプト＋問題＋Answer Key
2. `day2/listening-announce-{N}.html` — HTML（音声は外部参照）

## Announcement 問題仕様

### 概要
- 2つのアナウンスメント × 各2問 = 計4問
- アナウンス長: 40-85語程度
- アナウンス再生中は質問非表示 → 終了後に質問表示+15秒タイマー

### 場面設定（以下から選択）
- "in a classroom" / "on the campus radio station" / "at a school event"
- "in a lecture hall" / "at a library"

### トピックカテゴリ
- スケジュール: 講義、イベント、締め切り
- 指示: 手続き、場所変更
- 規則: 新しいポリシー、注意事項
- 功績: 学生・教員の受賞、達成

### 問題タイプ
- Main Idea / Detail / Inference / Purpose から各2問を構成

### 正解分布
- A=1, B=1, C=1, D=1（均等）

### 声の割り当て
- Narrator: Rachel (American, Female) — 固定
- Speaker 1/2: 性別・アクセントを変えて配置

### HTML仕様
- 既存の listening-announce.html の構造を完全に踏襲
- Page 0: Instruction（音声自動再生、終了までNext無効）
- アナウンスページ: 左に話者画像、右に問題（音声終了後表示）
- 15秒タイマー（残5秒で赤色警告、0秒で自動次問題）
- 選択肢選択前はNext無効
- フッター: Check All Answers / Reset All / Show All Answers
- auth.js連携
- 話者画像: Base64埋め込み

### 作成後
1. スクリプト＋問題＋Answer Keyをmdファイルに出力
2. HTML雛形を作成
3. `docs/topic-history.md` のAnnouncementセクションに使用したトピックを追記
4. 検証サマリーを表示
