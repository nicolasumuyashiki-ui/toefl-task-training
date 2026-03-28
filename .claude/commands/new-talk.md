Listen to an Academic Talk の新しい問題セットを作成してください。

## 事前準備（自動実行）
1. `docs/topic-history.md` を読み、Academic Talkセクションの使用済みトピックを確認する
2. `day2/` フォルダ内の既存academic talkファイルを確認する
3. 使用済みトピックと重複しない学術トピックを選定する

## 指定
$ARGUMENTS
- 例: `psychology bystander effect` → 指定されたトピックを使用
- 例: `life science` → 分野のみ指定、トピックはランダム
- 例: `random` or 空 → 全てランダム生成

## 出力ファイル（Phase 1）
1. `day2/talk-scripts-{N}.md` — 録音用スクリプト＋問題＋Answer Key
2. `day2/listening-academic-{N}.html` — HTML（音声は外部参照）

## Academic Talk 問題仕様

### 概要
- 100-250語の短い学術トーク（音声）→ 4問の多肢選択
- 話者: 教授/講師 1名
- 背景知識不要
- 音声は1回のみ再生（リプレイ不可）

### トピック分野（以下から選択）
History / Art and Music / Life Science / Physical Science / Business and Economics / Social Science

### トークの構造
1. Hook（導入）: 身近な例、質問、興味を引く事実
2. Main Concept（主概念）: 学術用語の導入と定義
3. Development（展開）: 対比、比較、詳細な説明
4. Examples（具体例）: 研究結果、実験、日常の例
5. Conclusion（結論）: 実生活への応用、次のトピックへの橋渡し

### 言語スタイル
- 口語的で自然な講義スタイル
- フィラー適度に使用（"you know," "well," "I mean"）
- 修辞的質問を含む
- 専門用語は導入時に必ず説明

### 問題タイプ（4問から構成）
- **Type 1: Main Topic（必須1問）** — トーク全体のテーマ
- **Type 2: Purpose（推奨1問）** — 特定の例が挙げられた理由
- **Type 3: Detail（推奨1-2問）** — 明示的に述べられた情報
- **Type 4: Inference（0-1問）** — 論理的に導ける結論
- **Type 5: Prediction（0-1問）** — 次に続く内容の予測
- **Type 6: NOT/EXCEPT（0-1問）** — 言及されていない情報

### 正解分布
- A, B, C, D がバランスよく分散

### 誤答設計
- 音の類似 / 部分的真実 / 過度な一般化 / 逆の主張 / 無関係な詳細

### 語数検証（必須・Pythonコード）
```python
talk_text = """[トーク本文]"""
wc = len(talk_text.split())
print(f"Word count: {wc}")
assert 100 <= wc <= 250, f"Must be 100-250, got {wc}"
print("✅ PASS")
```

### 声の割り当て
- Narrator: Rachel (American, Female) — 固定
- Speaker: トピックに合った声を選択（性別・アクセント指定）

### HTML仕様
- 既存の listening-academic.html の構造を完全に踏襲
- Page 0: 説明ページ
- Page 1: トーク再生（話者画像+「Now listening...」、1.5秒後に自動再生）
- Page 2-5: 問題ページ（4問）
- 音声終了後自動遷移（またはNextボタン）
- Backボタンなし
- フッター: Check All Answers / Reset All / Show All Answers
- 話者画像: Base64埋め込み
- auth.js連携

### 作成後
1. スクリプト＋問題＋Answer Keyをmdファイルに出力
2. HTML雛形を作成
3. `docs/topic-history.md` のAcademic Talkセクションに使用したトピックを追記
4. 語数検証をPythonで実行
5. 検証サマリーを表示
