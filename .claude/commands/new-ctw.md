Complete the Words (CTW) の新しい問題セットを作成してください。

> ✅ **ETS 公式 TOEFL iBT 2026 仕様準拠済み**（最終確認: 2026-06-14 / 産屋敷確認済み）
> 本仕様書のパッセージ語数・空欄数・制限時間等の数値は ETS 公式情報と整合している。
> 公式から逸脱する変更を加える際は、必ずこのバナーを更新すること。
> Routines / audit による公式準拠チェックでは、本ファイルは合格扱い。

## 事前準備（自動実行）
1. `docs/topic-history.md` を読み、CTWセクションの使用済みトピックを確認する
2. `reading/ctw/` フォルダ内の既存ファイルを確認し、次のPractice番号を特定する
3. 使用済みトピックと重複しないテーマを2つ選定する（Set 1, Set 2）
4. 既存の `reading/ctw/practice-1-set-1.html` を読み、HTML/CSS/JS構造を踏襲する

## 指定
$ARGUMENTS
- 例: `volcanoes, sleep science` → Set 1/2のトピック指定
- 例: `random` or 空 → 全てランダム生成

## 出力ファイル
1. `reading/ctw/practice-{N}-set-1.html` — Set 1 HTML（Module 1/Easier）
2. `reading/ctw/practice-{N}-set-2.html` — Set 2 HTML（Harder Module）
3. `reading/ctw/practice-{N}-answers.html` — 2セット分の解答解説ページ

## CTW 問題仕様

### 概要
- 1 Practice = 2セット（Set 1: Module 1/Easier / Set 2: Harder Module）
- 各セット: アカデミックパッセージの空欄に欠けた文字を入力
- 1セットあたりターゲットワード20語、うち10語がユーザー入力（残り10は表示のみ）
- 制限時間: 各セット10分（メインアプリ実装に合わせる）
- 入力欄バリデーション: 各 `.bx input` の input イベントで `value.replace(/[^A-Za-z]/g,'')` を必ずかけること。`inputmode="latin"` だけだと IME 経由で ひらがな・全角ローマ字・記号が入ってしまい、不公平な不正解が発生する

### パッセージ作成ルール
- **各セット 70-90 語のアカデミックパッセージ**（ETS 公式 2026 準拠: 約 80 語、10 incomplete words）
- `intro`（導入 1 文・15-25 語）+ `target` ワード群（本文・30-45 語）+ `conclusion`（結論 1 文・15-25 語）
- 自然な学術的文章（大学の教科書・講義レベル）
- **Set 1: Module 1/Easier（CEFR B1-B2）**
  - 日常的な学術トピック（教育、健康、環境など）
  - 基本的な学術語彙（significant, demonstrate, environment 等）
  - 接頭辞は3-5文字表示（残り2-4文字入力）
- **Set 2: Harder Module（CEFR B2-C1）**
  - より専門的なトピック（生態学、経済理論、神経科学など）
  - 高度な学術語彙（hypothesis, synthesize, unprecedented 等）
  - 接頭辞は1-3文字表示（残り4-6文字入力）— Set 1 より短いヒント
  - 複雑な文構造（関係代名詞の入れ子、分詞構文など）

### ターゲットワード選定ルール
- 20語のうち10語をユーザー入力（`a` フィールドに欠けた文字を指定）
- 残り10語は表示のみ（`a: null, s: null`）
- 入力語の品詞バランス: 名詞3-4、動詞2-3、形容詞2-3、副詞1-2
- 難易度バランス: MOD（やさしめ）5問、HARD（難しめ）5問

### データ形式（変数 `D`）
```javascript
var D = {
  "intro": "導入文（1-2文）",
  "conclusion": "結論文（1-2文）",
  "target": [
    { "w": "完全な単語", "a": "欠けた文字列", "s": "表示される接頭部分", "p": "後続の句読点" },
    { "w": "表示のみ", "a": null, "s": null, "p": "" },
    // ... 計20語
  ]
};
```

#### フィールド説明
- `w`: 完全な単語（正解）
- `a`: ユーザーが入力すべき文字列。`null` = 表示のみ
- `s`: 単語の先頭部分（ヒント）。`null` = 表示のみの語
- `p`: 単語直後の句読点（`,` `.` `;` など）。なければ `""`

#### ヒント設計ルール
- Set 1 MOD問題: 先頭3-5文字を表示（残り2-3文字を入力）
- Set 1 HARD問題: 先頭2-3文字を表示（残り3-4文字を入力）
- Set 2 MOD問題: 先頭2-3文字を表示（残り3-5文字を入力）
- Set 2 HARD問題: 先頭1-2文字を表示（残り4-6文字を入力）
- 入力文字数は最低2文字
- 接頭部分だけで単語が一意に特定できる場合は避ける

### HTML構造（既存踏襲 — 必ず practice-1-set-1.html を参照）
- トップナビ: `Set X of 2` / タイトル / タイマー / Review / ユーザーバッジ
- プログレスバー
- メインコンテンツ: 中央配置（max-width: 660px）
  - set-label → direction → passage（intro + targets + conclusion）
  - `a !== null`: 接頭部表示 + 1文字ずつの入力ボックス(`.bx`)
  - `a === null`: そのまま表示
- フッター: Menu / Next Set ボタン（Set 2 は「解答解説を見る →」）
- Reviewオーバーレイ: 各空欄の入力状況 + セット進行ドット

### JS変数（セットごとに変更）
```javascript
var SET_NUM = 1;  // 1 or 2
var NEXT_PAGE = "practice-{N}-set-2.html";  // Set 2 は answers ページ
```

### Set 2 の Harder Module 設定（必須）
Set 2 ファイルには以下を必ず適用すること：
```html
<body data-difficulty="harder">
```
```html
<script src="../../js/difficulty-badge.js"></script>
```
これにより Set 2 には「⚡ HARDER」バッジが自動表示される。Set 1 には適用しない。

### セッションストレージ
- キー: `ctw_p{N}_answers_{SET_NUM}`
- 値: `{ answers: [...], score: N, total: 10, words: [...] }`

### 解答ページ（practice-{N}-answers.html）
- 既存の practice-1-answers.html の構造を完全に踏襲
- 2セット分のスコアサマリー + 個別スコアカード
- Tips セクション（品詞特定、頻出パターン、推測の重要性）
- 各セットのタブ切替
- 各問題カード: 問題番号（正誤色分け）、表示部 + 正解 + 完全な単語、難易度タグ（MOD/HARD）、品詞、解説（日本語）

### passage表示文字列の生成ルール（v3.4 必須）
- **手打ち禁止**: passage の `shown + ___` 表示文字列は必ずデータ（D.target）からコードで自動生成すること
- **アンダースコア数 = answer の文字数**: `_` の個数は `len(a)` と完全一致
- **生成後にコード検証**: 生成した表示文字列をパースし、各 shown 部分と `_` 数がデータと一致するか確認

### 検証チェックリスト
- [ ] 各パッセージが **70-90 語**（ETS 公式 2026 準拠）
- [ ] 各セットのターゲットワード20語（入力10 + 表示10）
- [ ] 入力語の品詞バランス: 名詞3-4、動詞2-3、形容詞2-3、副詞1-2
- [ ] 難易度バランス: MOD 5問、HARD 5問
- [ ] 入力文字数が全問2文字以上
- [ ] `s` + `a` = `w` が全て一致（コード検証）
- [ ] `p`（句読点）が正確（コード検証）
- [ ] passage表示文字列のアンダースコア数 = 各answerの文字数（コード検証、目視禁止）
- [ ] passage表示文字列のshown部分 = データの`s`（コード検証）
- [ ] Set 2 に `data-difficulty="harder"` と `difficulty-badge.js` が設定されている
- [ ] Set 1 に `data-difficulty="harder"` が設定されていない
- [ ] 過去セットとトピックが重複していない

## 作成後
1. 2つのHTMLファイル + 解答ページを作成
2. `docs/topic-history.md` のCTWセクションに使用したトピックを追記
3. 検証サマリーを表示:
   - 各パッセージ語数
   - 品詞分布
   - 難易度分布（MOD/HARD）
   - データ整合性（s + a = w チェック）
   - 過去セットとの重複なし確認
