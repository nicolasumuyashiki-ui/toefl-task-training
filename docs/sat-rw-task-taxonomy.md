# SAT Reps — Reading and Writing タスク分類 ＆ データスキーマ設計

> このドキュメントは SAT版 Reps（タスク別トレーニング / Reading and Writing）の**設計の土台**。
> 実装は必ず `docs/build-guide.md`（再発防止指示書）の原則に従う。まずこの分類とスキーマを確定し、
> **1問=単一ソース（JSON）から練習ページと解答ページを自動生成**する（指示書 ★最重要④）。

---

## 1. Digital SAT Reading and Writing の構造（要College Board裏取り）

- RW セクションは **2モジュール制・アダプティブ**（モジュール2の難易度がモジュール1の出来で変わる）。
- 各設問は **短いパッセージ（25〜150語程度）＋ 1つの4択（A〜D）** という**極めて均一な形式**。
  → タスク別トレーニングに最適（TOEFL の LCR/RDL より単純で、単一テンプレートで全タスク型を賄える）。
- 配点は RW 200-800（Math と合わせ 400-1600）。**raw→scaled 換算表は要公式確認**（後述スキーマに `scaledTable` を持たせる）。

## 2. RW の4ドメイン × タスク型（＝トレーニングの単位）

College Board の公式ドメイン分類に沿ってタスク型を定義する。各タスク型が TOEFL版の「CTW」「RDL」等に相当。

| # | ドメイン | タスク型（フォルダ名） | 形式 | 備考 |
|---|---|---|---|---|
| 1 | Craft & Structure | **words-in-context**（語彙） | 短文＋空所/下線語 → 最適な語 | 最頻出。まず作る基準タスク |
| 2 | Craft & Structure | **text-structure-purpose**（構成・目的） | 短文 → 全体の構造/目的 | |
| 3 | Craft & Structure | **cross-text-connections**（テキスト間） | 2短文 → 両者の関係 | パッセージ2つ持つ |
| 4 | Information & Ideas | **central-ideas-details**（主旨・詳細） | 短文 → 主旨/詳細 | |
| 5 | Information & Ideas | **command-of-evidence-text**（根拠・本文） | 短文＋主張 → 支持する引用 | |
| 6 | Information & Ideas | **command-of-evidence-data**（根拠・データ） | 短文＋**図表/グラフ** → データで支持 | 図表データを持つ唯一のタスク |
| 7 | Information & Ideas | **inferences**（推論） | 短文 → 論理的に導ける結論 | 空所補充形式が多い |
| 8 | Standard English Conventions | **boundaries**（境界＝句読点） | 文＋空所 → 正しい句読点/接続 | 文法 |
| 9 | Standard English Conventions | **form-structure-sense**（動詞・代名詞等） | 文＋空所 → 正しい語形 | 文法 |
| 10 | Expression of Ideas | **rhetorical-synthesis**（統合） | 箇条書きメモ＋目標 → 目標を満たす文 | メモ配列を持つ |
| 11 | Expression of Ideas | **transitions**（接続表現） | 2文＋空所 → 最適な接続語 | |

**初期スコープ**: まず **#1 words-in-context** を基準テンプレートとして完成・検証 → 残り10タスク型に複製。
図表を持つ #6 と、複数パッセージの #3、メモ配列の #10 は**スキーマ拡張**が要るので、基準確立後に対応。

## 3. 1問のデータスキーマ（単一ソース = このJSONから練習・解答を自動生成）

```jsonc
{
  "taskType": "words-in-context",     // 上表のフォルダ名
  "practice": 1,                       // Practice 番号
  "items": [
    {
      "id": "wic-p1-q1",
      // パッセージ（下線/空所を ___ で示す。図表タスクは "figure" を追加）
      "passage": "While the committee's proposal was initially met with skepticism, its ___ presentation of the data gradually won over even the most doubtful members.",
      "prompt": "Which choice completes the text with the most logical and precise word or phrase?",
      "choices": [
        { "letter": "A", "text": "meticulous" },
        { "letter": "B", "text": "careless" },
        { "letter": "C", "text": "reluctant" },
        { "letter": "D", "text": "abbreviated" }
      ],
      "answer": "A",                    // 正解 letter（採点・解答表示の唯一の正本）
      "rationale": {                     // 解説（正解の理由＋各誤答が誤りの理由）
        "correct": "meticulous（細心の）は skepticism を覆すほど丁寧なデータ提示という文脈に最も精密に合う。",
        "distractors": {
          "B": "careless は「懐疑を覆す」という文脈と正反対。",
          "C": "reluctant は presentation を修飾する語として文意に合わない。",
          "D": "abbreviated（要約された）は説得力の根拠にならない。"
        }
      },
      "skillTag": "vocabulary-in-context"
    }
    // ... 1 practice = 5〜10 問
  ]
}
```

**スキーマ上の再発防止（指示書の具体化）**
- `answer` は letter 1箇所のみが正本。練習の採点も解答表示も**この同じフィールド**を見る（TOEFL の
  「数値index形式と letter 形式の混在」事故＝#89/#42 を最初から回避）。
- 練習ページ・解答ページは**このJSONから生成**（手で両方書かない＝#74/#122 の練習↔解答不一致を回避）。
- 生成時チェック: 選択肢は必ず A〜D の4つ・重複なし・`answer` が choices に存在・`rationale.distractors` が
  正解以外の3つ全てを説明しているか（jp/en 両方作るなら同一設問を述べているか照合）。
- 図表タスク(#6)は `figure`（データ表＋alt テキスト）を追加。挿入系が無いので一意性問題は起きにくいが、
  「データから読み取れる唯一の選択肢」になっているかを生成時に確認。

## 4. ファイル構造（TOEFL版の規則を踏襲）

```
reading-writing/
  words-in-context/
    practice-{N}.html            — 練習（1問ずつ表示・4択・タイマー）
    practice-{N}-answers.html    — 解答＋解説（正解/誤答理由・自分の回答表示）
    data/practice-{N}.json       — 単一ソース（上記スキーマ）
  text-structure-purpose/ ...    — 以下同じ構造で複製
menu.html                        — RW タスク一覧メニュー（バッジ＝サーバ復元）
index.html                       — ログイン（auth）
js/
  app.<hash>.js                  — 共有: auth + outbox保存 + history-sync（ハッシュ名でキャッシュ自動失効）
  render.js                      — data JSON → 練習/解答 DOM 生成（単一ソース原則）
docs/
  build-guide.md                 — 再発防止指示書（TOEFL版から移植）
  rw-task-taxonomy.md            — 本ファイル
CLAUDE.md                        — プロジェクト規則（指示書へのリンクを冒頭に）
```

## 5. 共有フレームワーク（js/app.<hash>.js）の契約 ─ 初日から内蔵する

指示書の原則を最初からコードに埋める。TOEFL版 `js/api.js`・`js/auth.js`・`js/history-sync.js` が実装リファレンス。

- **保存**: `Save.enqueue({userId, taskType, practice, answers, score, total, sessionId})`
  → 永続 outbox（localStorage, `clientSaveId` 冪等）→ **POST** → **ack 検証** → 検証後に done。撃ちっぱなし禁止。
- **サーバ upsert**: `(userId, sessionId)` で上書き。追記のみ禁止。分母 `total` を必ず保存。
- **キャッシュ名前空間**: 全キーに userId（`sat_score_<uid>_<taskType>_p<N>`）。ログイン中はセッション最優先。
  アカウント変化で前アカウントの表示キャッシュ＋未送信outboxをclear→サーバから復元。同一アカウント再読込では消さない。
- **スコア**: cutoff/換算表/重み/0点ガードを**この1モジュールに集約**。Admin と生徒画面が同一関数を使う。
  DOM の整形テキストから数値を読まない。表示直前に `Number(x).toFixed(1)` で正規化。
- **共有chrome**: フッター等は normal flow・`pointer-events:none` の中立。無条件 `position:fixed`/`flex-basis:100%` 禁止。
- **メディア非依存**: タイマー・進行はイベント成功に依存せずタイムアウトフォールバックを持つ。

## 6. 実装順（指示書「1つ作って検証→複製」）
1. スキーマ確定（本ファイル）→ `render.js`（JSON→DOM）+ `words-in-context/practice-1` を**完全に作り検証**。
2. 共有 `app.js` の保存/キャッシュ/スコアの骨組みを実装（GAS 未接続でもローカルで劣化動作）。
3. GAS バックエンド（upsert・ヘッダ正規化・negative非キャッシュ）をデプロイ。
4. words-in-context P2〜P10 を JSON 追加で量産。
5. 残り10タスク型に複製（図表#6・複数文#3・メモ#10 はスキーマ拡張）。
6. Admin・スコア画面（生徒と同一採点モジュール）。

---
_この設計は SAT版 Reps の合意ベース。変更したら本ファイルを更新し、影響するタスク型を再生成すること。_
