Read an Academic Passage の新しい問題セットを作成してください。

> ✅ **ETS 公式 TOEFL iBT 2026 仕様準拠済み**（最終確認: 2026-06-14 / 産屋敷確認済み）
> 本仕様書のパッセージ語数（180-220 語）・問題数（5問/パッセージ）・制限時間等の数値は
> ETS 公式情報と整合している（複数ソースで「約 200 語」を確認、margin ±20）。
> **Standard / Harder で語数は同じ**（公式準拠）。Harder の難化は語彙密度・構文・設問品質（§1-G）で実現すること。
> 公式から逸脱する変更を加える際は、必ずこのバナーを更新すること。
> Routines / audit による公式準拠チェックでは、本ファイルは合格扱い。

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
- 各パッセージ5問 = 計10問
- Split layout: 左パネル（パッセージ）+ 右パネル（問題1問ずつ）
- 制限時間: 25分（全問共有タイマー、sessionStorageで永続化）

### パッセージ作成ルール
- **Passage 1 (Standard)**: **180-220 語**（ETS 公式 2026 準拠: 約 200 語）、CEFR B1-B2、身近な学術トピック
- **Passage 2 (Harder Module)**: **180-220 語**（同上 — 公式は Standard/Harder で語数差なし）、CEFR B2-C1、専門性の高いトピック
- **Harder の難化方法**: パッセージを長くするのではなく、語彙密度（C1 低頻度語 ≥5）・構文密度（平均文長 ≥17、埋め込み節 ≥3）・設問品質（§1-G 準拠：WiC 二次的意味、Inference 2 ステップ統合、ディストラクター T1/T3/T6 を ≥2/問）で実現する
- **2-4 段落構成**（180-220 語に合った密度）
  - ETS 公式は「約 200 語・5 問」のみを規定し、**段落数の規定は存在しない**（2026-08-24 調査）。
    公式のタスク説明は測定対象を "how ideas are logically connected across sentences **and paragraphs**"
    と記述しており、複数段落構成が前提。したがって段落数は**本プロジェクト内の設計判断**である。
  - 「導入＋3 分類」型の題材（相利/片利/寄生、火成/堆積/変成、自然免疫/獲得免疫/記憶細胞 等）は
    4 段落が自然な区切りになるため許容する（200 語 ÷ 4 ≒ 50 語/段落）。
  - **5 段落以上にはしない**（1 段落あたりが細切れになり、Rhetorical Purpose / Inference の
    設問根拠が段落をまたぎすぎるため）。
- 各段落に `<p>` タグ、最後のパッセージの段落に `id="insertionParagraph"`（Sentence Insertion用）

### 問題タイプ（10問で以下から選択、各パッセージで最低3種類を混在）
- **Main Idea**: パッセージ全体の主旨を問う
- **Factual Information**: パッセージ中の具体的事実を問う
- **Vocabulary in Context**: 文脈中の語の意味を問う（ターゲット語は `.highlight-word` でハイライト）
- **Inference**: パッセージから推測できることを問う
- **Rhetorical Purpose**: 著者がなぜ特定の例・情報を挙げたかを問う
- **Sentence Insertion**: パッセージ内の適切な位置に文を挿入する（特殊UIあり、偶数番 practice で採用例あり）

### Sentence Insertion 問題の仕様（使用する場合）
- パッセージ内に4つの挿入候補位置（A/B/C/D）を `<span class="insert-square" data-insert="X">&#9632;</span>` で表示
- 挿入文は問題文に明示
- 正解は1箇所のみ（discourse markers や代名詞参照で一意に特定できること — CLAUDE.md参照）
- 選択するとパッセージが再構築され、挿入文が表示される

### 選択肢ルール
- 各問題4択（A-D）
- 各選択肢 5-15語（Vocabulary問題は除く）
- 正解分布: できるだけ均等に
- **Vocabulary問題: 選択肢は原則すべて単語1語の synonym**
  - 例: thrive → A struggle / B flourish / C compete / D migrate
  - フレーズ型（例: "grow and develop successfully"）は **1セットあたり最大1問まで（≦10%）**
  - 残り90%以上は単語1語形式にする（実 TOEFL の実態に合わせる）

### 質問文の paragraph 参照ルール
- ❌ `According to paragraph N, ...` 形式は**使わない**（新形式 TOEFL に存在しない）
  - 代わりに `According to the passage, ...` または paragraph ref 無し
- ✅ Vocabulary 問題の `The word "X" in paragraph N is closest in meaning to` は OK
- ✅ Sentence Insertion の `Look at the four squares [■] in paragraph N` は OK（必須）
- ✅ Rhetorical purpose の `Why does the author mention X in paragraph N?` は OK

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
- [ ] Passage 1: **180-220 語**（ETS 公式 2026 準拠）、Standard 難易度
- [ ] Passage 2: **180-220 語**（同上）、Harder Module 難易度（難化は §1-G v2.7 で実現）
- [ ] 各パッセージ **2-4 段落**（公式に段落数規定なし／5 段落以上は不可）
- [ ] 各パッセージ 5 問、計 10 問
- [ ] 各パッセージで最低 3 種類の問題タイプを混在
- [ ] 正解分布が A/B/C/D 各 2-3 個でバランス
- [ ] Sentence Insertion使用時: 正解位置が一意（discourse markers/代名詞で特定可能）
- [ ] Vocabulary問題使用時: ターゲット語が `.highlight-word` でハイライト
- [ ] **Vocabulary問題の選択肢は単語1語形式（フレーズ型は ≦10% / 1セット最大1問）**
- [ ] **`According to paragraph N` を使っていない**（`According to the passage` または paragraph ref 無し）
- [ ] 選択肢が5-15語で均一長（Vocabularyは除く）
- [ ] 正解が明確に1つだけ
- [ ] 過去セットとトピック重複なし

### パラフレーズ度チェック（Factual/Main Idea/Inference問題に適用）
正解選択肢が本文の丸コピーになっていないか確認:
- [ ] 正解選択肢と本文の連続一致が**4語以下**か（5語以上一致は要修正）
- [ ] 本文のキーワード（名詞・動詞）が同義語に置き換えられているか
- [ ] 以下のパラフレーズ技法のいずれかが使われているか:
  - 同義語置換（reduce → decrease, important → crucial）
  - 品詞変換（名詞 ⇄ 動詞）
  - 能動態 ⇄ 受動態
  - 文構造の再編成
  - 抽象化・一般化
- [ ] 「本文の該当文を指でなぞるだけで即答できる」レベルになっていないか

### Inference 推論必要度チェック（Inference問題のみ）
- [ ] 正解の内容が本文に**直接書かれていない**か（直接書かれていればFactualに変更）
- [ ] 本文の1文だけから即座に導けない設計か（複数情報の統合が必要か）
- [ ] 推論の根拠が本文に明確に存在し、かつ論理的飛躍が過剰でないか
- ❌ パターンA（推論ゼロ）: 本文に明記 → Factualに変更
- ❌ パターンB（パラフレーズだけ）: 同義語置換のみで推論不要 → 修正
- ❌ パターンC（過剰推論）: 根拠が本文にない → 修正

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
