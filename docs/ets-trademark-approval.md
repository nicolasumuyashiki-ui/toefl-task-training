# ETS Trademark Approval — TOEFL® 商標利用許諾の取得手順

## 背景

`TOEFL®` および `TOEFL iBT®` は Educational Testing Service (ETS) の登録商標です。
教材・予備校・学習サービスがブランド名や説明文に `TOEFL` を含める場合、ETS の
**商標利用ガイドライン**を遵守する必要があります。

ETS は、過去に無許諾で `TOEFL` をブランド名に使った企業に対して使用差止を
求めた事例があります。現状 TOEFL Reps は `TOEFL` を商品名（"TOEFL Reps"）に
直接組み込んでいるため、できるだけ早期に許諾取得を進めるべきです。

## 取得経路（実務上の選択肢）

ETS の許諾には大きく 3 段階あります。下に行くほど厳格・高コスト：

| 段階 | 内容 | 取得難易度 | コスト |
|---|---|---|---|
| **A. Disclaim 表示のみ** | 商標表示と免責文を全ページに掲載。許諾申請せず使用 | 不要 | 0 |
| **B. ETS Preparation Provider** | ETS 公式の試験対策プロバイダ登録 | 中 | 年会費＋審査 |
| **C. ETS Authorized Test Center** | 試験会場としての提携 | 高 | 高い・本サービスとは無関係 |

**TOEFL Reps の場合、最低でも A を即時実施し、並行して B の取得を進める**
のが現実解です。

## A. Disclaim 表示（即時実施可能・ノーコスト）

ETS の `Brand Standards Guidelines` では、TOEFL を言及する非公式教材は以下を
表示することが推奨されています：

> TOEFL® is a registered trademark of Educational Testing Service (ETS).
> This product is not endorsed or approved by ETS.

### 実装場所

1. **全 HTML ページのフッター** — 既存の「© TCK Workshop · TOEFL Reps」行の隣に
   小さく追加。CSS は既存の `.footer` 内のサイズで揃える。
2. **terms.html 第 16 条（知的財産権）** — 1 項追加：
   > 「TOEFL® および TOEFL iBT® は、Educational Testing Service（米国 ETS）の
   > 登録商標です。当サービスは ETS から公認・推奨を受けたものではなく、
   > 当社が独自に開発した TOEFL iBT 形式のタスクトレーニング教材を提供する
   > ものです。」
3. **LP（`tck-toefl-reps-lp-*.html`）の最下部** — Hero 直下またはフッターに
   小さな disclaim ライン。
4. **マーケティング素材（OGP、Twitter 画像等）** — 余白に小文字で。

これだけでも法的リスクは大きく下がります。

## B. ETS Preparation Provider（中期目標）

ETS は試験対策事業者向けに `Test of English as a Foreign Language` の使用許諾を
出すスキームがあります。日本国内では下記が窓口：

- **問い合わせ先**: `TOEFLPrepProvider@ets.org`
- **公式情報**:
  https://www.ets.org/toefl/
  （"Resources" → "For Teachers" → "Promotional / Marketing materials")
- **代理店**: 日本国内では Council on International Educational Exchange (CIEE)
  が ETS 日本事務局として一部窓口業務を行っているケースあり。

### 申請メール（ドラフト）

下記文面をベースに、英文メールで申請してください。

---

**To**: TOEFLPrepProvider@ets.org
**Cc**: info@ets.org
**Subject**: Trademark Use Authorization Request — "TOEFL Reps" by TCK Workshop (Japan)

```
Dear ETS Trademark Team,

I am writing on behalf of TCK Workshop, Inc., a Japan-based educational
services company. We have developed and launched an online task-based
practice platform for the TOEFL iBT® test, branded as "TOEFL Reps,"
available at https://apps.tckworkshop.co.jp/toefl-task-training/.

We are formally requesting authorization to:

1. Use the term "TOEFL" as part of our product name ("TOEFL Reps").
2. Reference "TOEFL iBT" in product descriptions, marketing materials,
   and user-facing content.
3. Display ETS-published raw-to-scaled score conversion tables for
   educational purposes within our app's "Predicted Score" feature.

Product overview:
- Subscription-based web application (¥3,980/month in Japan).
- Task-by-task drills covering all four skills (Reading, Listening,
  Writing, Speaking) modeled after the TOEFL iBT 2026 format.
- Predicted-score estimation using ETS public conversion tables.
- No reproduction of official ETS test items; all content is original.

We commit to:
- Display the standard trademark notice ("TOEFL® is a registered
  trademark of Educational Testing Service. This product is not
  endorsed or approved by ETS.") on every page.
- Comply with ETS Brand Standards Guidelines in all marketing materials.
- Not represent our service as an official ETS preparation product
  unless explicitly authorized.
- Submit any further marketing materials for ETS review upon request.

Please advise on:
- The application form or process to formalize this authorization.
- Any licensing fees or annual obligations.
- Required disclaimers or formatting standards beyond what we are
  already implementing.

Company details:
- Legal name: 株式会社ティー・シー・ケー・ワークショップ (TCK Workshop, Inc.)
- Representative: 馬奈木 太郎 (Taro Manaki) ← 実際の代表者名に差し替え
- Address: ← 特商法ページの所在地に差し替え
- Website: https://www.tckwshop.com/
- Product URL: https://apps.tckworkshop.co.jp/toefl-task-training/
- Contact: nicolas.umuyashiki@tckworkshop.co.jp / +81-XX-XXXX-XXXX

We look forward to your guidance.

Best regards,
Nicolas Umuyashiki
TCK Workshop · TOEFL Reps
```

---

### 申請時に添付すべき資料

1. 法人登記簿謄本（英訳版 — 日本商工会議所で発行可）
2. プロダクトのスクリーンショット 5〜10 枚（ログイン画面、メニュー、各タスク代表例、
   Predicted Score 画面、Billing 画面）
3. 利用規約・プライバシーポリシーの英訳版
4. 既に実施済みの disclaim 表示の証跡

## C. 並行作業

- 申請から回答まで **4〜8 週間** かかる前提でスケジュール。
- 並行して **A の disclaim 表示は必ず実施**。これだけでも訴訟リスクは大幅に下がる。
- B が認められない場合でも、disclaim を継続表示する限り「fair use（公正利用）」の
  範囲とみなされる可能性が高い。

## 次のアクション（チェックリスト）

- [ ] A: 全 HTML フッターに disclaim 文を追加（PR を別途）
- [ ] A: terms.html 第 16 条に商標条項を追加
- [ ] A: LP に disclaim を追加
- [ ] B: 上記ドラフトを英文校正に出す
- [ ] B: 添付資料（謄本英訳、スクショ、規約英訳）を準備
- [ ] B: ETS へ送信
- [ ] B: 4 週間後にフォローアップメール送信
- [ ] B: 回答受領後、本ファイルに結果を追記
