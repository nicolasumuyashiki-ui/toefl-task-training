# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## プロジェクト概要
TOEFL iBT タスク別トレーニング — 全タスク対応の自主練習教材プラットフォーム。
GitHub Pages でデプロイ: nicolasumuyashiki-ui/toefl-task-training

## ファイル構造
```
reading/ctw/practice-{N}.html          — Complete the Words
reading/rdl/practice-{N}.html          — Read in Daily Life
reading/academic/practice-{N}.html     — Read an Academic Passage
listening/lcr/practice-{N}.html        — Listen and Choose a Response
listening/conv/practice-{N}.html       — Listen to a Conversation
listening/announce/practice-{N}.html   — Listen to an Announcement
listening/talk/practice-{N}.html       — Listen to an Academic Talk
writing/sentence/practice-{N}.html     — Build a Sentence
writing/email/practice-{N}.html        — Write an Email
writing/discussion/practice-{N}.html   — Academic Discussion
speaking/lr/practice-{N}.html          — Listen and Repeat
speaking/ti/practice-{N}.html          — Take an Interview
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
| CTW | 3問 | 最後の1問がHarder Module |
| RDL | 2問 | 1問目が短め、2問目が長め |
| Academic Passage | 2問 | 後半1問がHarder Module |
| LCR | 8問 | Q1-2:B1, Q3-5:B1-B2, Q6-8:B2 |
| Conversation | 2会話×2問 | |
| Announcement | 2題×2問 | |
| Academic Talk | 2題×4問 | 後半1題がHarder Module |
| Build a Sentence | 16問 | |
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

## 問題作成時の参照先
- `.claude/commands/` にあるスラッシュコマンドの仕様書を必ず読むこと
- `docs/history-*.md` でトピック重複を確認すること
- PPTXの攻略コツを解答解説に組み込むこと
