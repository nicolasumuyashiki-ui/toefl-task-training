Take an Interview の新しい問題セットを作成してください。

## 事前準備（自動実行）
1. `docs/topic-history.md` を読み、Take an Interviewセクションの使用済みトピックを確認する
2. `day4/` フォルダ内の既存interviewファイルを確認する
3. 使用済みトピックと重複しないテーマを選定する

## 指定
$ARGUMENTS
- 例: `technology and social media` → 指定されたテーマを使用
- 例: `random` or 空 → 全てランダム生成

## 出力ファイル（Phase 1）
1. `day4/ti-scripts-{N}.md` — 録音用スクリプト（Narrator + Q1-Q4）＋画像選択
2. `day4/ti-{N}.html` — HTML（音声・画像はプレースホルダー）

## Take an Interview 問題仕様

### 概要
- インタビュアーの質問4つに対して自分の考えを述べる
- 各45秒の回答時間
- 前半: 個人的経験、後半: 意見＋根拠

### 自動進行フロー
Next → Narrator音声 → 2秒 → Q1音声（[2秒pause]含む）→ 1秒 → 45秒カウントダウン → 2秒 → Q2... → Q4 → Complete

### 質問の段階構成
| Q | タイプ | 内容 |
|---|--------|------|
| Q1 | Factual / Personal | 個人的な経験・事実に関する簡単な質問 |
| Q2 | Behavioral / Personal | 行動パターンとその理由 |
| Q3 | Opinion / Argue | 意見を述べ、根拠を示す |
| Q4 | Opinion / Broader Issue | より広い社会的テーマについて意見 |

### 質問の特徴
- Q1: 短い導入の挨拶 + [2秒pause] + 質問本体
- Q2-Q4: 前の回答への短いリアクション + 質問本体
- Q3-Q4: 「Some people believe...」等の対立意見を提示してから質問
- 全質問が同一テーマに関連

### トピック設定
- リサーチスタディ、調査、学術インタビューの場面
- 一般的な生活テーマ（食、都市、テクノロジー、教育等）
- 4つの質問が同一テーマで段階的に深まる

### 声の指定
- **Narrator**: シナリオ説明のみ（Interviewerとは別の声）
- **Interviewer**: 質問4つすべて（同じ声）
- アクセント: American / British / Australian / NZ

### インタビュアー画像（画像ストックから選択）
| ファイル名 | 性別 | 外見 | 合う声 |
|---|---|---|---|
| 男性① | M | 若め・フォーマル | River, George |
| 男性② | M | 中年・アカデミック | Daniel, Chris |
| 男性③ | M | 年配・カジュアル研究者 | Brian, Bill |
| 男性④ | M | 年配・教授風 | Arnold, Clyde |
| 女性① | F | 年配・落ち着いた | Dorothy, Matilda |
| 女性② | F | 若め・プロフェッショナル | Aria, Jessica |
| 女性③ | F | 中年・エレガント | Charlotte, Grace |
| 女性④ | F | 中年・温かみ | Rachel, Sarah |

**選択ルール:** 声の性別=画像の性別、年齢感・トーンも合わせる

### HTML仕様
- 既存の ti-1.html の構造を完全に踏襲
- Instruction画面: 説明表＋警告＋右上Nextボタン
- タスクページ: 指示文＋トランスクリプトボックス（薄紫背景）＋画像＋タイマー
- トランスクリプト: 現在再生中=ハイライト、回答済み=dimmed
- タイマー: 45秒、黒背景中央配置
- 音声: narrator.mp3, q1.mp3-q4.mp3（外部参照プレースホルダー）
- 画像: 選択した画像ファイル名をscenarioImageに設定
- auth.js連携

### タイミング仕様
| パラメータ | 値 |
|---|---|
| responseTime | 45秒 |
| preTimerDelay | 1000ms |
| postTimerDelay | 2000ms |
| Q1内ポーズ | 2000ms（導入と質問の間） |

### 作成後
1. スクリプト（Narrator + Q1-Q4）＋画像選択をmdファイルに出力
2. HTML雛形を作成
3. `docs/topic-history.md` のTake an Interviewセクションに使用したトピックを追記
4. 検証サマリー:
   - 質問タイプ分布（Factual→Behavioral→Opinion→Broader確認）
   - 声・画像マッチング確認
   - 全質問が同一テーマに関連していることの確認
