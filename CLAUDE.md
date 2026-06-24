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

## 共有JSのキャッシュバスティング（再発防止・最重要）
GitHub Pages は静的配信で、ブラウザは `js/*.js` を**数日キャッシュ**する。保存POST化・履歴復元・ベスト表示
などの**挙動修正をマージしても、お客様のブラウザが古いJSを掴んでいると新コードが走らない**（「日頃のPCで変化なし」
の主因。Pages 再ビルドは数分で終わるので半日後の不具合は再ビルド遅延では説明できない＝ブラウザキャッシュが原因）。
- 全 HTML の共有JS `<script src="…js/NAME.js">` には `?v=YYYYMMDD` を付ける（例 `js/auth.js?v=20260624`）。
- **`js/` 配下を変更したら必ず** `python3 tools/bump-cache-version.py <YYYYMMDD>` を実行してバージョンを上げ、
  同じコミットに含める。これで全クライアントが新コードを1回だけ再取得する。
- 動的ロード（`auth.js→api.js`、`progress.js→api.js`、`admin-answer-overlay.js`/`student-history.js`）は
  ローダ側の正規表現が `$1` で**自分のバージョンを引き継ぐ**ので、静的タグだけ bump すれば全体に伝播する。
- お客様には初回のみ強制再読み込み（Ctrl+Shift+R / スマホはタブを閉じて開き直す）も案内する。

## コミットメッセージの規則
- `feat: add Reading CTW Practice 2` — 新しい問題を追加
- `fix: correct answer key in rdl practice-1` — 正解の修正
- `style: update header across all pages` — デザイン変更
- `docs: update CLAUDE.md` — ドキュメント更新

## やってはいけないこと
- js/api.js の GAS_URL を変更しない（本番URLが入っている）
- index.html の認証ロジックを変更しない
- 既存の問題ファイルの正解を勝手に変更しない（必ず確認を求めること）
- **学習者の履歴・スコアを絶対にリセットしない**（下記「履歴は絶対にリセットしない」参照）
- **朝次監査の修正実施時も同様**: バグ修正（タイマー・リンク・HTML 構造等）を行う場合でも、生徒の受講履歴・スコア
  （localStorage `training_*` / `tck_*`、sessionStorage、サーバ ANSWERS / RECORDINGS / PT_RESULTS）には一切触れない。
  これはすべての朝次監査で共通の不変ルール（`.claude/commands/audit.md` 禁止事項にも明記）。

## 履歴は絶対にリセットしない（最重要・再発防止）
お客様の取り組み履歴・スコアは**サーバ（GAS の ANSWERS シート、userId 紐付け）が唯一の正本**。
各 attempt は `Api.saveAnswers` で必ずサーバに保存される。`localStorage` / `sessionStorage` は
表示用キャッシュにすぎない（`sessionStorage` はブラウザを閉じると消える）。

- **問題ファイルの微修正・リライト・採点ロジック調整の際に、以下を消去・初期化してはならない**:
  - localStorage: `training_score_*` / `training_first_*` / `training_attempts_*` / `tck_done_*` / `tck_progress_*`
  - サーバ ANSWERS シートの行
- **表示は必ずサーバから復元する**: メニュー4枚（reading/listening/writing/speaking の menu.html）と
  my-score.html は `js/history-sync.js`（`Api.getMyHistory`）でサーバから履歴を取得し、上記 localStorage
  キーに書き戻してバッジ・スコアを描画する。これにより **どのブラウザ・デバイスで入っても同じアカウントなら
  履歴が必ず引き継がれる**。`history-sync` は追加・更新のみで、履歴を消すことは一切しない。
- **復元の優先順位**: 同一セッションの結果（sessionStorage）→ サーバ最新（localStorage `training_score_*`）→
  初回（`training_first_*`）。履歴消失後に2回目を取り組んだ場合は、**新しい方（最新の attempt）を正本として復元**する。
- サーバ側エンドポイント `getMyHistory` の本体は `docs/gas-my-history.js`（GAS にペースト＆デプロイ）。
  未デプロイでも frontend は壊れず、ローカルキャッシュ表示に degrade する。

### 全タスクのサーバ保存（`js/auth.js` の sessionStorage フック）
`auth.js` は `sessionStorage.setItem('training_score_<task>_p<N>', …)` を監視して、**全ページ共通で**:
1. **最新スコアを localStorage にミラー**（`training_score_*`）。`sessionStorage` はブラウザを閉じると消えるが
   localStorage は残るので、**同一PCならバックエンド無しでもスコアが消えない**。
2. **サーバ未保存タスクを自動で `Api.saveAnswers`**（`api.js` を必要なら遅延ロード）。対象は
   `{rdl, academic, lcr, conv, announce, talk, sentence}`（set 文字列は `"RDL P1"` 等）。
   これで別ブラウザ・別デバイスでも履歴が引き継がれる。
- **除外**（二重保存を防ぐため auto-save しない）: `ctw`（set ファイルが `"CTW PN Set X"` を保存）、
  `email`/`discussion`（`finishWriting` で保存）、`lr`/`ti`（録音を RECORDINGS シートに保存。加えて
  `speaking-recorder-hook.js` の `showComplete` で `"LR PN"`/`"TI PN"` の軽量 done 行を ANSWERS に保存し、
  別デバイスでも「提出済み」が復元される）。
- **my-score の反映**: free-response（email/discussion/lr/ti）は `training_score` を持たないため、
  `collectAttempts` は `tck_done_*`（ISO 日時）を見て status `'submitted'` 行として学習履歴に出す。
- 新タスク追加時は、独自に `saveAnswers` するか、この allowlist (`AUTO_SAVE_LABELS`) に追加するか
  どちらかで**必ずサーバ保存される状態**にすること。`training_score_*` を sessionStorage だけに書いて
  放置すると、そのタスクだけ履歴が消える（過去の RDL/Academic/LCR 等で実際に発生 → 修正済み）。
- **日付表示**: `training_score_*` の `updatedAt`（各ページが書く ISO）と `training_first_*` の `capturedAt` を
  サーバ復元時も `history-sync` が引き継ぐ。my-score の学習履歴テーブルは `fmtWhen()` で JST 整形して表示する。

### Practice Test（模試）の履歴
模試は `practice-test/js/api.js` の `savePtResult`/`listPtResults` で**集約 GAS（REC_URL = 本番 API_URL と同じ）**に保存。
本体は `docs/gas-pt-results.js`（`PT_RESULTS` シート、userId 紐付け、sessionId で重複排除）。results.html は
`Api.savePtResult` が無いと "history disabled" で degrade する。模試の素点/換算/Band は results.html が DOM から再収集して送る。

### 復習モード（retry）ポップアップ
`auth.js` の `maybeShowRetryModal` は **1 practice につきセッション 1 回だけ**表示する（`sessionStorage tck_retry_shown_<task>_p<N>`）。
CTW の Set1→Set2 等、複数ページにまたがる practice で毎回出ないようにするため。「practice 開始時だけ」が要件。

### バッジは「ベスト（最高点）」表示
メニューのスコアバッジは **最高点**を表示する（`training_best_<task>_p<N>`）。誤って開いて0点を保存しても下がらない。
`history-sync.applyAttempts` がサーバ全 attempt から set ごとの最高点を集計し、`auth.js` の完了フックも「より高い時だけ」更新する。
`training_score_*`（最新）は my-score の最近表示用に保持、`training_first_*`（初回）は予想スコア用。`readScore` は best を優先。

### 中断（Resume）のサーバ同期＝別端末で再開できる
中断スナップショット（`tck_progress_*`）は **サーバにも同期**する（別端末で「最初から」になるのを防ぐ）。
- `progress.js`：`save()`→`Api.saveProgress`（POST/大きい本文対応）、`clear()`→`Api.clearProgress`、`promptResume()` はローカルが無ければ `Api.getProgress` で**サーバから復元**。`api.js` 未読込のページでも遅延ロードする。
- `history-sync` の `mirrorProgress()` がメニュー hydrate 時にサーバの中断をローカル `tck_progress_*` へ写し、別端末でも「中断中」バッジが出る。
- サーバ本体は `docs/gas-progress-sync.js`（`PROGRESS` シート、userId+task+practice で upsert）。**未デプロイでも従来どおりローカル中断で動作**（degrade）。

## Writing 完了時の markDone / clear（再発防止）
free-response タスク（Email / Discussion）の練習ページは、**完了関数（`finishWriting`/`complete`）の中で**
`TCKProgress.clear()` と `TCKProgress.markDone()` を呼ぶこと。これを誤って `resetAll()`（リセットボタン）側に
置くと、**完了しても `tck_progress_*` が残り `tck_done_*` が立たず、メニューが「中断中」のまま**になる
（discussion practice-2〜10 で実際に発生 → 修正済み）。`resetAll()` は `clear()` のみ。
検出: 完了関数内に `markDone` があるか、`saveAnswers` 行直後を grep で確認。

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
- **lang-toggle handler 欠落（解説・tips ページ）**: `data-lang-btn="jp"` `data-lang-btn="en"` のボタンを top-nav に置く HTML には、対応する click handler の inline JS（`setLang()` 関数 + `body.setAttribute('data-lang', l)` + `localStorage.setItem('tck_lang', l)`）を `</body>` 直前に**必ず**含めること。`progress.js` の handler は練習ページの floating cluster 用で、静的 top-nav ボタンには attach されない。検出grep: `grep -L 'setLang(b.getAttribute' $(grep -l 'data-lang-btn' …)`
- **練習ページの script 読み込み順**: `<script src="../../js/progress.js">` は inline `<script>` より**前に**置くこと。後ろに置くと inline script 内の `if(window.TCKProgress) TCKProgress.mountExitButton(...)` が undefined チェックに引っかかり、フローティング言語トグル・終了ボタン・再開プロンプトが表示されない。同様に `auth.js` `difficulty-badge.js` も依存される箇所より先に置く（auth.js は DOMContentLoaded 自動初期化があるので致命的ではないが、原則先に置く）。
- **重複 `id` 属性**: 解説ページで既存問題を renumber する際、新規追加 card と旧 card で `id="card4"` 等が重複しないか確認すること。`grep -o 'id="card[0-9]*"' file | sort -u | wc -l` で件数チェック。
- **解説の jp/en 内容ズレ**: 既存解説の翻訳作業で `<span class="jp">…</span>` 内に他問の解説テキストが混入する事故が過去発生（practice-1, 2, 3, 4 academic answers の旧 Q4-Q6 で発覚）。renumber や追加時は必ず両言語の内容が同じ設問について述べているか確認。

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

## ETS 公式 TOEFL iBT 2026 仕様準拠状況（2026-06-14 最終確認）

`.claude/commands/` 内の各 `.md` 仕様書は ETS 公式 2026 仕様と整合済み。冒頭に「✅ ETS 公式準拠済み」バナーがある仕様書は、Routines / audit による公式準拠チェックでは合格扱い。

| タスク | 公式パッセージ語数 | 公式問題数 |
|---|---|---|
| CTW | 70-90 語 | 10 incomplete words |
| RDL | 15-150 語（典型 60-120） | 2-3 問/パッセージ |
| Academic Passage | **180-220 語**（公式: 約 200 語、Standard / Harder で語数差なし） | 5 問/パッセージ |
| Academic Talk | — | 4 問/talk |
| Email | — | 1 問・7 分 |
| Discussion | — | 1 問・10 分 |

仕様書を変更する場合は、公式から逸脱していないか確認の上、バナーの最終確認日を更新すること。

### タイマー値（確定・2026-06-16）
画面表示・JS実装・仕様書（`.claude/commands/`）の3者を必ず一致させること。
| タスク | 1問/全体の時間 | 根拠 |
|---|---|---|
| LCR | 20 秒/問 | ETS 公式で唯一明示された問題別タイマー |
| Conversation | 20 秒/問 | |
| Announcement | **20 秒/問** | ETS は問題別秒数を非公開（アダプティブ・回答中のみカウント）。第三者目安「約30秒/問」を踏まえた設計値 |
| Academic Talk | **30 秒/問** | 同上。第三者目安「約30秒/問」に整合 |
| Build a Sentence | **7 分（420秒）固定・10問** | 多数ソースが「10問・約7分（6:50≈7分）」で一致 |
| Write an Email | 7 分 | ETS 公式 |
| Academic Discussion | 10 分 | ETS 公式 |
| RDL | 10 分 | Reading 全体 約30分を CTW/RDL/Academic で配分。RDL 単独25分は不成立のため約10分（ETS は問題別非公開・設計判断） |
| Take an Interview | 45 秒/問 | 仕様書・表示に整合 |
| Listen & Repeat | 文ごと | — |
※ Listening の問題別秒数は ETS 非公開のため設計判断。変更時はこの表とソース（Test Resources / Writing30 / Study.com 等）を更新。
