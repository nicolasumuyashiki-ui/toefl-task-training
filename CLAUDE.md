# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## プロジェクト概要
TOEFL iBT タスク別トレーニング — 全タスク対応の自主練習教材プラットフォーム。
GitHub Pages でデプロイ: nicolasumuyashiki-ui/toefl-task-training

## ファイル構造
```
reading/ctw/practice-{N}-set-{1,2}.html    — Complete the Words（1セット1ファイル）
reading/rdl/practice-{N}.html              — Read in Daily Life
reading/academic/practice-{N}.html         — Read an Academic Passage
listening/lcr/practice-{N}.html            — Listen and Choose a Response
listening/conv/practice-{N}.html           — Listen to a Conversation
listening/announce/practice-{N}.html       — Listen to an Announcement
listening/talk/practice-{N}.html           — Listen to an Academic Talk
writing/sentence/practice-{N}.html         — Build a Sentence
writing/email/practice-{N}.html            — Write an Email
writing/discussion/practice-{N}.html       — Academic Discussion
speaking/lr/practice-{N}.html              — Listen and Repeat
speaking/ti/practice-{N}.html              — Take an Interview
```
- 解答ページ: `practice-{N}-answers.html`（同ディレクトリ）
- Speakingの攻略コツ: `practice-{N}-tips.html`

## 問題ファイルの規則
- 各HTMLは自己完結型（CSS・JSはインライン、音声はbase64）
- 全ページで `js/auth.js` を読み込み、未ログインならindex.htmlにリダイレクト
- パスは階層に注意: reading/ctw/ からは `../../js/auth.js`

## 各Practice内の問題数
| タスク | 問題数/Practice | 備考 |
|--------|----------------|------|
| CTW | 2セット×10 blanks | Set 1: Module 1/Easier（CEFR B1-B2、接頭辞3-5文字表示）。Set 2: Harder Module（CEFR B2-C1、接頭辞1-3文字表示、HARDERバッジ表示）。セットごとに別パッセージ |
| RDL | 2パッセージ×計4〜6問 | パッセージあたり 2〜3問。ETS は per-task 件数を固定していないので、4〜6問の幅で OK |
| Academic Passage | 2パッセージ×5問 = 計10問 | 後半パッセージ（Q6-Q10）が Harder Module（プロジェクト内の擬似 Harder 慣習）。制限時間 25 分 |
| LCR | 8問 | Q1-2:B1, Q3-5:B1-B2, Q6-8:B2 |
| Conversation | 2会話×2問 | |
| Announcement | 2題×2問 | |
| Academic Talk | 2題×4問 = 計8問 | 1 talk あたり4問（ETS 仕様）。後半1題が Harder Module（プロジェクト内の擬似 Harder 慣習） |
| Build a Sentence | 10問 | 約7分制限、各1点（ETS 2026 仕様） |
| Write an Email | 1問 | 7分制限 |
| Academic Discussion | 1問 | 10分制限 |
| Listen & Repeat | 7文 | 段階的に長くなる |
| Take an Interview | 4問 | 段階的に深くなる |

## コミットメッセージの規則
- `feat: add Reading CTW Practice 2` — 新しい問題を追加
- `fix: correct answer key in rdl practice-1` — 正解の修正
- `style: update header across all pages` — デザイン変更
- `docs: update CLAUDE.md` — ドキュメント更新

## やってはいけないこと
- js/api.js の GAS_URL を変更しない（本番URLが入っている）
- index.html の認証ロジックを変更しない
- 既存の問題ファイルの正解を勝手に変更しない（必ず確認を求めること）

## 音声生成時の必須ルール（再発防止）
- **スクリプト→音声→解答の一貫性**: 音声を生成する際、ElevenLabsに送るテキスト（スクリプト）を**必ずそのまま**解答ページの問題文（`q`フィールド等）にコピーすること。要約・言い換え・記憶による再構成は厳禁。
- **スクリプトファイルの保存**: 音声生成に使用したスクリプトは `docs/scripts/` に `{tasktype}-practice-{N}-scripts.md` として保存すること。音声と解答ページの照合に使う。
- **生成フロー**: ① スクリプトを確定 → ② スクリプトファイルを保存 → ③ ElevenLabsで音声生成 → ④ 同じスクリプトを解答ページにコピー → ⑤ base64化してHTMLに埋め込み
- **検証**: 音声埋め込み後、解答ページの問題文とスクリプトファイルの内容が完全一致するか必ず確認すること
- **ポーズ仕様**: ターン交代・節間の沈黙時間は `docs/audio-pause-spec.md` の標準（デフォルト 400–600 ms、上限 1500 ms）に従う。SSML `<break time="500ms"/>` をスクリプトに必ず明示すること。生成後は `audit_audio.py` で検証、外れ値が出れば `normalize_audio.py` で正規化。

## HTML 生成時の再発防止チェック（過去のバグ）
- **`\u####` リテラル**: HTML テキスト（`<script>` の外側）に `✅` 等の Unicode escape を埋め込まない。実際の文字（✅、→ など）を直接書くこと。JS 文字列内の `'✅'` は OK（パーサが解釈する）。
- **データ整合性 (LCR系)**: 練習ページの `questions` と解答ページの `QS` が一致しない事故が過去発生。新規生成時は同じソースから両ファイルを派生させること。`{choices:[{letter,text}],answer:N}` のような数値 index 形式を使う場合、比較コードも数値で行うか letter に正規化する一文を入れる。
- **EN テキスト混入**: メニュー・全画面で日本語 UI を使う場合は `<span class="jp">…</span><span class="en">…</span>` のペアで bilingual 化。片方だけ書くと言語切替時に空表示になる。
- **基底 CSS の前提**: `css/common.css` は design tokens + i18n primitive のみ。`.header` `.back-pill` `.user-pill` 等のページ chrome は各 HTML の inline `<style>` で持つこと。
- **CTW 入力欄スペーシング**: `.sh{margin-right:.22em}` `.word-blank{margin-right:.45em}` を必ず適用（短すぎると「a m■■don't」が「am◆◆don't」と詰まって読みづらい）。
- **Build a Sentence ピリオド**: 文末の `.` `!` `?` を word bank の最後の piece に含めない（最後の piece が一目で判別できてしまうため）。`fixedEnd` に移動。

## kickstart HW形式への準拠（重要）
すべてのタスクはTOEFL kickstart HWの形式を踏襲する。参照先: `toefl-kickstart-hw` リポジトリ。
- **Listening (LCR/Conv/Announce/Talk)**: スタートオーバーレイ→音声再生→1問ずつ表示→タイマー→自動進行→結果画面
- **Speaking (LR/TI)**: Instructionページ→音声再生→カウントダウンの逐次進行
- **Writing (Discussion/Email/Sentence)**: Instructionページ→タイマー付きライティング→完了画面
- **Reading (CTW)**: 1セット1ファイル（`practice-{N}-set-{1,2}.html`）、セット間はNext→ファイル遷移
- **Reading (Academic/RDL)**: Split layout、1問ずつ表示

## Build a Sentence 複数正解対応
- `altAnswers` フィールドで別解を定義（配列の配列）
- 採点ロジック: `answer` OR `altAnswers` のいずれかに一致すれば正解
- 解答解説ページ: 別解がある場合は `alt` フィールドで表記
- 並列構造（both...and, X or Y, リスト順序）の入れ替えが主なケース
- 新規問題作成時も別解の有無を必ず確認すること

## Sentence Insertion問題の注意事項
- Academic Passageの挿入問題は正解が1箇所のみでなければならない
- 複数箇所にinsertできてしまう問題は修正が必要
- 新規作成時: 挿入文にdiscourse markers（However, In addition等）や代名詞参照を入れ、正解位置を一意にすること

## 問題作成時の参照先
- `.claude/commands/` にあるスラッシュコマンドの仕様書を必ず読むこと
- `docs/topic-history.md` でトピック重複を確認し、作成後は同ファイルに追記すること（以前は技能別4分割 `docs/history-{技能}.md` を想定していたが、実体は単一ファイルに統合されている）
- PPTXの攻略コツを解答解説に組み込むこと
