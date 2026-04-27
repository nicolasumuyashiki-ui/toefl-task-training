# 個別指導講師の方へ — TOEFL Reps アプリ仕様の概要

TCK Workshop の TOEFL 学習アプリ「TOEFL Reps」をご利用中の生徒さんへの個別指導を担当いただきありがとうございます。下記、アプリの仕組みと講師の関わり方をまとめます。

---

## 1. アプリの全体像

- **URL**: https://apps.tckworkshop.co.jp/toefl-task-training/
- **対象**: 月額サブスクで利用する TOEFL iBT（2026 年新形式）対策アプリ
- **タスク数**: 全 4 技能 × 約 12 種類のタスクトレーニング、各 10 Practice ずつ
- **採点**: Reading・Listening は自動採点、Writing・Speaking は**自動採点なし**

## 2. 自動採点の範囲

| 技能 | 自動採点 | 補足 |
|---|---|---|
| Reading | ✅ あり | CTW、RDL、Academic Passage 全て |
| Listening | ✅ あり | LCR、Conv、Announce、Talk 全て |
| Writing | ❌ なし | Build a Sentence のみ自動採点（文の並び替え）。Email・Discussion は提出のみ |
| Speaking | ❌ なし | Listen & Repeat、Take an Interview 共に録音保存のみ |

→ **Writing の Email / Discussion、Speaking の全タスクは「個別指導オプション」（＝先生のセッション）で初めて添削・フィードバックが得られる**設計です。

## 3. 個別指導セッションのフォーマット

- **料金**: ¥10,000（税込 ¥11,000）／ 1 セッション
- **時間**: 60 分（Zoom）
- **内容**: 1 セッションあたり**最大 2 技能**まで生徒さんがリクエスト可能
  - 例：Speaking + Writing、Reading + Listening、Writing 単体 など
- **申し込み**: 生徒さんが `private-coaching.html` から `info@tckworkshop.co.jp` にメール → 事務局経由で先生にお繋ぎ
- **事前情報**: メール本文に「希望日時／対象技能／取り上げたい問題」が記載されているはずです

## 4. セッション中によく扱う内容

### Writing 系
- Email / Discussion の生徒提出文を添削
- 文法・構成・タスク達成度（0-5 スケール）の評価
- 模範解答提示
- TOEFL 採点ルーブリックの共有

### Speaking 系
- Take an Interview の録音音声をその場で再生 → 振り返り
- 発話テンプレート（Independent / Integrated）の指導
- 発音・流暢さ・タスク達成度の即時フィードバック

### Reading / Listening 系（補助）
- 自動採点で取れない正答率パターン分析
- 弱点問題タイプ（Inference／Rhetorical Purpose 等）の集中演習

## 5. 講師がアプリ上で確認できる情報

**現状、講師アカウントは用意していません。** 生徒さんから直接以下の情報をご提供いただくのが基本フローです：

- Predicted Score（予想スコア）のスクショ
- 該当タスクの解答結果ページ URL
- Email / Discussion の提出内容（コピペ or スクショ）

→ 将来的に「講師向け閲覧モード」を実装する可能性ありますが、現状は生徒経由でお願いします。

## 6. 知っておくとよいアプリ用語

| 用語 | 意味 |
|---|---|
| **Module 1 / Easier / Harder** | TOEFL 2026 のアダプティブ方式に準拠。Module 1 は標準難度、Module 2 は前半成績で Easier または Harder に分岐 |
| **Predicted Score** | 1 回目の素点をもとに ETS 公式換算表で算出した予想スコア。120 点満点（旧）/ 6.0 点満点（新）両表示 |
| **Band Score 1.0-6.0** | ETS が 2026 年 1 月から導入した新スケール。0.5 刻み |
| **Mastery Rate** | 復習による習得度。最新の挑戦結果ベース。Predicted とは別指標 |
| **Harder バッジ** | Reading / Listening の難問パートに表示される「⚡ HARDER」表示 |

## 7. 質問・相談先

- 仕様の詳細・改善要望: Nicolas（プロダクト担当）
- 生徒さんとの調整・スケジューリング: 事務局（info@tckworkshop.co.jp）

ご不明点があればお気軽にお声がけください！
