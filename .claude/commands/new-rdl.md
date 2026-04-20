Read in Daily Life (RDL) の新しい問題セットを作成してください。v2.2 仕様準拠。

## 事前準備（自動実行）
1. `docs/topic-history.md` を読み、RDL セクションの使用済みトピック・文書タイプを確認
2. `reading/rdl/` 内の既存 P1〜P(N-1) を読み、各 Practice が使った文書タイプ 2 種を把握
3. 使用済みトピックと重複しない題材を 2 つ選定
4. 既存の `reading/rdl/practice-1.html` を読み、HTML/CSS/JS 構造を踏襲

## 指定
$ARGUMENTS
- 例: `menu, advertisement` → 指定された文書タイプで生成
- 例: `random` or 空 → タイプ・題材ともにランダム生成

## 出力ファイル
1. `reading/rdl/practice-{N}.html` — 問題ページ
2. `reading/rdl/practice-{N}-answers.html` — 解答解説

## RDL 問題仕様

### 概要
- 1 Practice = 2 つの日常的文書 × 各 2〜3 問
- 問題数ルール: 15–50 words → 2 問、51–150 words → 3 問
- Split layout: 左パネル（文書）+ 右パネル（問題）
- 制限時間: 25 分
- CEFR B1–B2

### 文書タイプ（11 種、毎 Practice 異なる 2 種を選択）
必ず以下の 11 種から **2 種を選択**。**同じ 2 種の組み合わせを過去に使用している場合は必ず別の組み合わせを選ぶ**。

| # | タイプ | Instruction | HTML ラッパー |
|---|---|---|---|
| 1 | Poster / Sign / Notice | Read a notice / sign / poster. | `.notice-container` |
| 2 | Menu（レストラン・カフェ） | Read a menu. | `.menu-container` |
| 3 | Social Media Post / Web Page | Read a social media post / web page. | `.phone-frame .social-header` |
| 4 | Schedule | Read a schedule. | `.schedule-container` |
| 5 | Email（個人／機関） | Read an email. | `.email-container` |
| 6 | Text Messages（1 対 1 SMS） | Read a chain of text messages. | `.phone-frame .message-thread` |
| 7 | Advertisement | Read an advertisement. | `.ad-container` |
| 8 | News Article | Read a news article. | `.article-container` |
| 9 | Form | Read a form. | `.form-container` |
| 10 | Invoice / Receipt | Read a receipt / invoice. | `.receipt-container` |
| 11 | Text Chain / Live Chat（グループチャット） | Read a text chain. | `.chat-container` |

### 🚨 CRITICAL: タイプの多様性ルール
1. **2 つのパッセージは異なるタイプ**（例: Menu + Advertisement ✓ / Email + Email ✗）
2. **直近 3 Practice が使ったタイプは避ける**（`reading/rdl/practice-{N-1,N-2,N-3}.html` をスキャンし、使われた類型の和集合を取り、そこに含まれないタイプを優先）
3. Type 5（Email）と Type 1（Notice）は Practice 1 で既使用のため、同じ組合せは厳禁
4. Type 6 と Type 11 は両方テキスト会話だが形式が違う（1 対 1 SMS vs グループチャット）— これらを同一 Practice で併用しない

### 問題数ルール
- 15–50 語 → 2 問
- 51–150 語 → 3 問
- ランダム化パターン：
  - A: 2問(短) + 3問(長) = 計5問
  - B: 3問(長) + 2問(短) = 計5問
  - C: 2問(短) + 2問(短) = 計4問
  - D: 3問(長) + 3問(長) = 計6問

### 問題タイプ（各パッセージ 2-3 問、最低 1 つは Factual Information）
- ① FACTUAL INFORMATION（必須、最低 1 問/パッセージ）
- ② NEGATIVE FACTUAL INFORMATION（EXCEPT / NOT）
- ③ INFERENCE
- ④ TEXT PURPOSE / MAIN IDEA
- ⑤ VOCABULARY IN CONTEXT（イディオム・口語）

### HTML テンプレート
各パッセージタイプの HTML ラッパー構造および専用 CSS は、既存の `reading/rdl/practice-1.html` および v2.2 Guide（チャットログ参照）の仕様に完全準拠。共通 CSS（top-nav, footer, review overlay 等）は CTW と同一。

### 選択肢ルール
- 4 択（A–D）
- 各選択肢 5–12 語、均一長
- ダッシュ/セミコロンで文をつなげない
- 正解分布: できるだけ均等に

### 検証チェックリスト
- [ ] 2 つの文書が異なるタイプ（11 種の中から選択）
- [ ] 直近 3 Practice と使用タイプが重複していない
- [ ] 各パッセージ 15–150 語
- [ ] 問題数が語数ルールに一致
- [ ] 各パッセージに最低 1 つ Factual Information
- [ ] 全選択肢が 4 つ (A-D)、正解が 1 つだけ
- [ ] ディストラクターがもっともらしい
- [ ] CEFR B1-B2

### パラフレーズ度チェック（Detail/Inference 問題に適用）
- [ ] 正解選択肢と本文の連続一致が **4 語以下**
- [ ] 本文のキーワードが同義語に置換
- [ ] 「本文を指でなぞるだけで即答」にならない設計

## 作成後
1. HTML 問題ページ + 解答ページを作成
2. `docs/topic-history.md` の RDL セクションに以下形式で追記：
   ```
   | N | 1 | [Type1] | [Topic1] |
   | N | 2 | [Type2] | [Topic2] |
   ```
3. 検証サマリーを表示：
   - 選択した 2 つのタイプ（11 種のどれか）
   - 各パッセージ語数
   - 問題数パターン（A/B/C/D）
   - 直近 3 Practice のタイプとの重複なし確認
   - 選択肢語数チェック、正解一意性
   - トピック重複なし
