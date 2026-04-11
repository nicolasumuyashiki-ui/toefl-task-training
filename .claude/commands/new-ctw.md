Complete the Words (CTW) の新しい問題セットを作成してください。

## 事前準備（自動実行）
1. `docs/topic-history.md` を読み、CTWセクションの使用済みトピックを確認する
2. `reading/ctw/` フォルダ内の既存ファイルを確認し、次のPractice番号を特定する
3. 使用済みトピックと重複しないテーマを3つ選定する（Set 1, 2, 3）
4. 既存の `reading/ctw/practice-1-set-1.html` を読み、HTML/CSS/JS構造を踏襲する

## 指定
$ARGUMENTS
- 例: `volcanoes, sleep science, ancient rome` → Set 1/2/3のトピック指定
- 例: `random` or 空 → 全てランダム生成

## 出力ファイル
1. `reading/ctw/practice-{N}-set-1.html` — Set 1 HTML
2. `reading/ctw/practice-{N}-set-2.html` — Set 2 HTML
3. `reading/ctw/practice-{N}-set-3.html` — Set 3 HTML（Harder Module）
4. `reading/ctw/practice-{N}-answers.html` — 3セット分の解答解説ページ

## CTW 問題仕様

### 概要
- 1 Practice = 3セット（Set 1, 2: Module 1 / Set 3: Harder Module）
- 各セット: アカデミックパッセージの空欄に欠けた文字を入力
- 1セットあたりターゲットワード20語、うち10語がユーザー入力（残り10は表示のみ）
- 制限時間: 各セット36分

### パッセージ作成ルール
- 各セット200-250語程度のアカデミックパッセージ
- `intro`（導入1-2文）+ `target` ワード群（本文）+ `conclusion`（結論1-2文）
- 自然な学術的文章（大学の教科書・講義レベル）
- Set 1-2: CEFR B1-B2（Module 1相当）
  - 日常的な学術トピック（教育、健康、環境など）
  - 基本的な学術語彙（significant, demonstrate, environment 等）
  - 接頭辞は3-4文字表示（残り2-4文字入力）
- Set 3: CEFR B2-C1（Harder Module — やや難しい語彙・構文）
  - より専門的なトピック（生態学、経済理論、神経科学など）
  - 高度な学術語彙（hypothesis, synthesize, unprecedented 等）
  - 接頭辞は2-3文字表示（残り4-6文字入力）— Set 1-2 より短いヒント
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
- MOD問題: 先頭3-5文字を表示（残り2-4文字を入力）
- HARD問題: 先頭1-3文字を表示（残り4-6文字を入力）
- 入力文字数は最低2文字
- 接頭部分だけで単語が一意に特定できる場合は避ける

### HTML構造（既存踏襲 — 必ず practice-1-set-1.html を参照）
- トップナビ: `Set X of 3` / タイトル / タイマー / Review / ユーザーバッジ
- プログレスバー
- メインコンテンツ: 中央配置（max-width: 660px）
  - set-label → direction → passage（intro + targets + conclusion）
  - `a !== null`: 接頭部表示 + 1文字ずつの入力ボックス(`.bx`)
  - `a === null`: そのまま表示
- フッター: Menu / Next Set ボタン（最終セットは「解答解説を見る →」）
- Reviewオーバーレイ: 各空欄の入力状況 + セット進行ドット

### JS変数（セットごとに変更）
```javascript
var SET_NUM = 1;  // 1, 2, or 3
var NEXT_PAGE = "practice-{N}-set-2.html";  // Set3は answers ページ
```

### セッションストレージ
- キー: `ctw_p{N}_answers_{SET_NUM}`
- 値: `{ answers: [...], score: N, total: 10, words: [...] }`

### 解答ページ（practice-{N}-answers.html）
- 既存の practice-1-answers.html の構造を完全に踏襲
- 3セット分のスコアサマリー + 個別スコアカード
- Tips セクション（品詞特定、頻出パターン、推測の重要性）
- 各セットのタブ切替
- 各問題カード: 問題番号（正誤色分け）、表示部 + 正解 + 完全な単語、難易度タグ（MOD/HARD）、品詞、解説（日本語）

### 検証チェックリスト
- [ ] 各パッセージが200-250語
- [ ] 各セットのターゲットワード20語（入力10 + 表示10）
- [ ] 入力語の品詞バランス: 名詞3-4、動詞2-3、形容詞2-3、副詞1-2
- [ ] 難易度バランス: MOD 5問、HARD 5問
- [ ] 入力文字数が全問2文字以上
- [ ] `s` + `a` = `w` が全て一致
- [ ] `p`（句読点）が正確
- [ ] Set 3 が Harder Module 相当の難易度
- [ ] 過去セットとトピックが重複していない

## 作成後
1. 3つのHTMLファイル + 解答ページを作成
2. `docs/topic-history.md` のCTWセクションに使用したトピックを追記
3. 検証サマリーを表示:
   - 各パッセージ語数
   - 品詞分布
   - 難易度分布（MOD/HARD）
   - データ整合性（s + a = w チェック）
   - 過去セットとの重複なし確認
