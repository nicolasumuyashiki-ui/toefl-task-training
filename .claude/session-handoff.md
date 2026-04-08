# セッション引き継ぎ（2026-04-08）

## 前セッションで完了した作業
- Listening全タスク（LCR/Conv/Announce/Talk）をkickstart HW形式に変換（51ファイル）
- Speaking全タスク（LR/TI）をkickstart HW形式に変換（20ファイル）
- CTWを1セット1ファイルに分割（practice-{N}-set-{1,2,3}.html、30ファイル生成、元ファイル削除済み）
- Build a Sentenceに複数正解（altAnswers）対応追加（7問＋全10ファイルの採点ロジック修正）
- CLAUDE.mdにkickstart準拠・Build a Sentence・Sentence Insertion注意事項を追記

## LCR practice-2〜10が未変換
- practice-1のみkickstart形式に変換済み（音声埋め込み済み）
- practice-2〜10は音声データなし（audio-pending状態だった）→ kickstart形式に変換が必要
- practice-1の構造を参照: `listening/lcr/practice-1.html`

## 残りのタスク（優先順）

### 1. Reading commands作成（CTW/RDL/Academic）
ユーザーが3つのプロンプト（CTW v3.3、RDL v2.2、Academic v3.2）を提供済み。
- `.claude/commands/new-ctw.md`, `new-rdl.md`, `new-academic.md` を新規作成
- **そのまま保存するのではなく**、致命的に重要な部分を分析・抽出し、コンパクトで効率的なプロンプトに再構成すること
- 参照元プロンプトはチャット履歴にある（2026-04-08のユーザーメッセージ）

### 2. Academic practiceの50%にSentence Insertion問題を追加
- 現在のpractice-1〜10には**Sentence Insertion問題が0個**
- プロンプトではQ17-Q20の選択肢にSentence Insertionが含まれる
- **50%の出現率**（10 practiceのうち5つ）に含める
- 正解は**必ず1箇所のみ**。複数箇所に入る曖昧な問題は禁止
- JS実装: `normalParagraphHTML` / `insertionParagraphHTML` の切り替え、■マーカー
- CSS: `.insert-square`, `.inserted-sentence`, `.insertion-sentence-display` 等が必要
- kickstart参照: `day1/academic-1.html` のQ20にSentence Insertion実装あり

### 3. LCR practice-2〜10をkickstart形式に変換
- practice-1と同じ構造（Start overlay→1問ずつ→音声→選択肢アンロック→20秒タイマー→結果画面）
- 音声はプレースホルダー（空文字列）で作成
- kickstart参照: `day2/lcr.html`
- practice-1の構造を参照してPythonスクリプトで一括変換
- 正解データは各practice-{N}-answers.htmlの`correctAnswers`配列から取得

### 4. Reading全体のプロンプト準拠検証
- CTW: 分割完了済みだが、v3.3プロンプトの全仕様に準拠しているか確認
- RDL: v2.2プロンプトとの差異を確認
- Academic: v3.2プロンプトとの差異を確認（Sentence Insertion以外にも）

## 参照パス
- kickstart HW: `C:\Users\umuyashikin\toefl-kickstart-hw\.claude\worktrees\clever-diffie\`
- practice files: `C:\Users\umuyashikin\toefl-task-training\`
- 変換スクリプト例: 前セッションで使った `_convert_all.py` パターン（ファイルから抽出→kickstart形式で再構築→上書き）

## 原則
- **全タスクはkickstart HW形式を踏襲する**（UI構造・フロー・CSS・JS）
- kickstartの「形式」を使い、コンテンツ（問題・音声）はpractice固有のものを使う
- commands作成時: そのまま保存せず、致命的部分を抽出してコンパクトに再構成
