Listen and Choose a Response (LCR) の新しい問題セットを作成してください。

## 事前準備（自動実行）
1. `docs/topic-history.md` を読み、LCRセクションの使用済みトピックを確認する
2. 既存LCRファイルを確認し、次のセット番号を特定する
3. 使用済みトピックと重複しないテーマを選定する

## 指定
$ARGUMENTS
- 例: `campus health center, study abroad office` → 指定されたシーンを含める
- 例: `random` or 空 → 全てランダム生成

## 出力ファイル（Phase 1: スクリプト＋HTML雛形）
1. `docs/scripts/lcr-practice-{N}-scripts.md` — 録音用スクリプト＋問題＋Answer Key
2. `listening/lcr/practice-{N}.html` — HTML（音声はプレースホルダー）
3. `listening/lcr/practice-{N}-answers.html` — 解答解説ページ

================================================================================
TOEFL iBT - Listen and Choose a Response 問題作成ガイド v2.4.1（Module 1 — Routing Module）

【CHANGELOG v2.4 → v2.4.1】※ 既存88問の監査で実検出した複数正解パターンを反映
[ADDED] §3 落とし穴 ④:「集団行動への誘い」発話 + "alone" / "on my own" /
        "I prefer to..." を含む distractor の組み合わせを禁止。
        実検出例: TT practice-3 Q4 "Would you like to form a study group?" +
        (B) "I always study alone at home." / PT test3 Q1 "Did you find a study
        group?" + (D) "I prefer to study on my own most of the time." はいずれも
        Type 12 暗示的断りとして 100% 自然に成立してしまう。
[ADDED] §4 誤答設計原則に (e) 一般陳述（generic statement）を追加（4 → 5 分類）。
[ADDED] §8 チェックリストに「落とし穴 ④ の回避確認」項目を追加。

【CHANGELOG v2.3 → v2.4】※ 複数正解の根本対策
[ADDED] §3 冒頭に「Distractor Justification Table」を導入。
        各選択肢が distractor として不適切である理由を生成時に明文化することを必須化。
[ADDED] §5 出力フォーマットに同表を組み込み (rationale だけでは不十分)。
[ADDED] §3 に「既知の落とし穴 ①〜③」(確認質問 + Type 9 / 計画報告 + Type 7,9,10 /
        募集勧誘 + Type 9 vs 12) を追加し、過去発生した複数正解パターンを明示。
[ADDED] §3 チェック4 に "1ステップ test" (誤答を返した想定で次の発話を想像できるか)
        を追加。
[CLARIFIED] 不適切理由を 4 → 5 分類に拡張: (e) generic statement を追加。
        「事実として正しい」だけでは応答機能していない distractor を明確に NG とする。

【CHANGELOG v2.2 → v2.2.1】
[ADDED] 選択肢フォーマットルールに「カンマで2つの独立節をつなげない」を追加
[ADDED] §3チェック2に「distractorが別のResponse Typeとして成立しないか」を追加
[ADDED] §3にチェック4「Distractor Response Type排他性チェック」を新設

【CHANGELOG v2.1 → v2.2】
[ADDED] 「自然な受け答え」12タイプ分類（Response Typology）を導入
[ADDED] 各問題に正解の応答タイプを明示的に指定するルールを追加
[ADDED] 8問で最低6タイプ以上カバーする分布ルールを追加
[ADDED] 誤答設計における「タイプ不一致」の原則を追加
[ADDED] 正解の一意性チェックルール（複数正解の防止）を追加
[UPDATED] 正解・誤答の具体例を各タイプごとに刷新
[UPDATED] 選択肢の語数ルール 3〜10語に変更（v2.3 — ETS公式サンプル準拠）
[RETAINED] 画像↔声の1:1マッピングルール（v2.1準拠）
[RETAINED] アクセント分布ルール（v2.1準拠）

================================================================================
§0. リサーチ結果サマリー

■ Module 1 (Routing Module) の仕様
- 全受験者共通の難易度
- Listening全体で約20〜32問（Module 1）
- うち Listen and Choose a Response は約8問
- CEFR B1〜B2レベル（中級〜中上級）
- 60%以上の正答率で Hard Module (Module 2) に進む

■ Listen and Choose a Response の特徴
- 約5秒の短い1文を聞く（音声のみ、テキスト表示なし）
- 4つの書かれた選択肢から最も適切な応答を選ぶ
- キャンパスライフ・日常生活の場面
- pragmatic understanding（語用論的理解）を測定
- 話者の意図、トーン、文脈の理解が鍵

■ CEFR B1-B2 の特徴（問題作成の指針）
- B1: 日常的な話題について明確な標準語を理解できる
- B2: 具体的・抽象的な話題の主要点を理解できる
- → Module 1は B1下位〜B2上位の幅広い難易度をカバー
- → 8問中、B1レベル2問、B1-B2ブリッジ3問、B2レベル3問が目安

================================================================================
§1. 自然な受け答え 12タイプ分類（Response Typology）

LCRの正解は「自然な会話における応答」である。以下の12タイプを定義し、
各問題の正解がどのタイプに該当するかを設計段階で明示すること。

### Type 1: 間接的な回答（Indirect Answer）
- 定義: 相手の質問にYes/Noや直接的な情報で答えず、状況説明で暗に答える。
- 測定力: 推論力（聞き手が「つまり○○だ」と結論を導く必要がある）
- 難易度: B1-B2〜B2 向き
- 例:
  - Q: "Did you finish the assignment?"
  - ✅ "I was at work until midnight." （＝終わっていない、を暗示）
  - ❌ "No, I did not finish it."（直接的すぎる）
- 注意: 間接性が強すぎると正解が不明瞭になる。聞き手が1ステップの推論で意図を理解できるレベルに留めること。

### Type 2: 情報提供・助言（Informing / Advising）
- 定義: 相手が困っている・探している状況に対して、役立つ情報や提案を返す。
- 測定力: 状況把握力（相手の困りごとを正確に理解しているか）
- 難易度: B1〜B1-B2 向き
- 例:
  - Q: "I can't find the registrar's office."
  - ✅ "I think they moved to the third floor."
  - ❌ "The registrar handles student records."（情報だがニーズに応えていない）

### Type 3: 共感・同調（Empathizing / Agreeing）
- 定義: 相手の感想や不満に共感を示しつつ、自分の経験や意見を添える。
- 測定力: トーン理解力（相手の感情・態度を読み取れるか）
- 難易度: B1〜B1-B2 向き
- 例:
  - Q: "The dining hall food has been terrible lately."
  - ✅ "Yeah, I've been eating off campus all week."
  - ❌ "The dining hall is in the student center."（共感がない）

### Type 4: 条件付き承諾（Conditional Acceptance）
- 定義: 相手の提案や依頼に対して、条件や留保を付けて受け入れる。
- 測定力: 語用論的理解力（承諾しているが無条件ではないことを理解できるか）
- 難易度: B1-B2〜B2 向き
- 例:
  - Q: "Want to present first in class tomorrow?"
  - ✅ "Sure, but only if we rehearse beforehand."
  - ❌ "I love giving presentations."（質問に答えていない）

### Type 5: 驚き・意外性の表明（Expressing Surprise / Reacting to News）
- 定義: 相手の発言が予想外だったことを示し、それに反応する。
- 測定力: 前提理解力（話者が何を予想していたかを理解できるか）
- 難易度: B1-B2〜B2 向き
- 例:
  - Q: "The campus bookstore is closing for good next month."
  - ✅ "Really? I thought they just renovated it last year."
  - ❌ "Bookstores sell textbooks and supplies."（反応になっていない）

### Type 6: 訂正・補足（Correcting / Clarifying）
- 定義: 相手の前提や認識の誤りをやんわり指摘する、または補足情報を提供する。
- 測定力: 詳細理解力（発話中の誤った前提を聞き取れるか）
- 難易度: B1-B2〜B2 向き
- 例:
  - Q: "The deadline is next Friday, right?"
  - ✅ "Actually, they pushed it up to Wednesday."
  - ❌ "Deadlines are important to meet."（訂正していない）

### Type 7: 代替案の提示（Offering an Alternative）
- 定義: 相手の計画や意図に対して、別の選択肢を提案する。
- 測定力: 状況把握力（相手の計画を理解した上で別案を出せるか）
- 難易度: B1〜B1-B2 向き
- 例:
  - Q: "I was going to drive to campus today."
  - ✅ "It might be quicker to walk from here."
  - ❌ "I have a car, too."（代替案になっていない）

### Type 8: 前提への気づき・思い出し（Realizing / Recalling）
- 定義: 相手の発言をきっかけに、忘れていたことや見落としに気づく。
- 測定力: 語用論的理解力（「思い出した」という心的状態を読み取れるか）
- 難易度: B2 向き
- 例:
  - Q: "Did you know the library hours changed this semester?"
  - ✅ "Right, I forgot they changed the policy."
  - ❌ "The library is on the east side of campus."（気づきがない）

### Type 9: 意図・計画の表明（Stating Intention / Plan）
- 定義: 相手の状況説明や情報に対して、自分がこれからどうするかを返す。
- 測定力: 因果推論力（情報→行動の自然なつながりを理解できるか）
- 難易度: B1-B2〜B2 向き
- 例:
  - Q: "The scholarship essay deadline is this Friday."
  - ✅ "I'd better start working on mine tonight then."
  - ❌ "Scholarships are competitive."（行動表明がない）

### Type 10: 体験の共有（Sharing Experience）
- 定義: 相手の質問や状況に対して、自分の類似体験で返す。
- 測定力: 関連性理解力（自分の体験が相手の状況にどう関連するかを理解できるか）
- 難易度: B1〜B1-B2 向き
- 例:
  - Q: "How did you get your parking permit renewed?"
  - ✅ "I got mine through the department website."
  - ❌ "Parking permits are required on campus."（体験共有がない）

### Type 11: 不確実性の表明（Expressing Uncertainty / Hedging）
- 定義: はっきり答えられないが、推測や部分的な情報を提供する。
- 測定力: ニュアンス理解力（「確信がない」というトーンを読み取れるか）
- 難易度: B2 向き
- 例:
  - Q: "Do you think the tutoring center can help with statistics?"
  - ✅ "It depends on what level you're at, I think."
  - ❌ "Statistics is a branch of mathematics."（不確実性がない）

### Type 12: 暗示的な断り・消極的反応（Implicit Refusal / Reluctance）
- 定義: 直接「No」と言わず、理由や状況を述べて断りや消極性を示す。
- 測定力: 推論力（拒否の意図を間接表現から読み取れるか）
- 難易度: B2 向き
- 例:
  - Q: "Can you lend me your notes from yesterday's lecture?"
  - ✅ "I actually wasn't in class yesterday either."
  - ❌ "No, I can't lend you my notes."（直接的すぎる）

================================================================================
§2. タイプ分布ルール

- 8問で最低6タイプ以上をカバーすること
- 同じタイプを3回以上使わないこと
- 各問題の設計時に「Response Type: Type X（名称）」を明記すること
- 難易度との対応:
  - B1 (Q1-Q2): Type 2, 3, 7, 10 が適しやすい（直接的・明快な応答）
  - B1-B2 (Q3-Q5): Type 4, 5, 6, 9 が適しやすい（やや間接的）
  - B2 (Q6-Q8): Type 1, 8, 11, 12 が適しやすい（暗示的・推論が必要）
  - ※ 上記は目安であり、柔軟に組み合わせてよい

================================================================================
§3. 正解の一意性チェックルール（複数正解の防止） — v2.4 強化版

【設計時の必須プロセス：DISTRACTOR JUSTIFICATION TABLE】

各問題を作成する際、選択肢を書く前に必ず以下の表を作成する。
書いた後ではなく、**書きながら** distractor の不適格理由を明文化することで、
事後チェックでは検出できない曖昧性を生成段階で潰す。

| 選択肢 | 表面の応答タイプ判定 | この場面で不適切な理由 | 通過判定 |
|---|---|---|---|
| (A) ... | Type X (該当 or "該当なし") | (a)〜(e) のどれに該当するか + 1文説明 | ✅ / ❌ |
| (B) ... | ... | ... | ... |
| (C) ... | ... | ... | ... |
| (D) ... | ... | ... | ... |

不適切理由の分類 (a)〜(e):
- (a) topic trap: 発話の話題と無関係
- (b) phonetic trap: 音が似た語の罠
- (c) pragmatic trap: 話題は同じだが発話の意図 (質問/依頼/報告) に答えていない
- (d) inference trap: 発話にない前提を勝手に追加
- (e) generic statement: 一般論・定義・事実陳述で「この特定の発話への返答」になっていない

**正解以外の3つすべてに (a)〜(e) のいずれかが明記できなければ、その問題は再設計する。**

特に注意:
- "could naturally be said by someone hearing this prompt" → ❌
- "is a true statement about the topic" → これだけでは ❌（応答として機能していない）

---

### チェック1: 正解の応答適切性
- 正解選択肢を発話スクリプトと組み合わせて声に出して読み、自然な2人の会話として成立するか確認する。
- 「この返答を聞いて、会話が自然に続けられるか？」が基準。

### チェック2: 誤答の排他性 — STRICT MODE
- 各誤答選択肢を「実際の学生がこの発話を聞いて返した」と仮定し、**会話が破綻なく続くか**を確認する。
- 一つでも「自然に続く」誤答があれば、それは複数正解状態。修正必須。
- **1ステップ test**: 誤答を返したと仮定して、相手が次に発する一言を想像できるか？できる場合、その誤答は正解と競合している可能性が高い。
- 安全 distractor の条件 (上記 (a)〜(e) のいずれか):
  - (a) topic trap: 発話の話題と無関係
  - (b) phonetic trap: 音が似た語を使っているが意味が合わない
  - (c) pragmatic trap: 話題は同じだが発話の意図に答えていない
  - (d) inference trap: 発話にない前提を追加
  - (e) generic statement: 一般論・定義・事実陳述

### チェック3: 長さ・複雑さの均一性
- 4つの選択肢の語数を数え、最長と最短の差が4語以内であることを確認する。
- 正解だけが明らかに長い・短い・複雑な構文になっていないか確認する。

### チェック4: Distractor Response Type排他性チェック — v2.4 拡張
- 各誤答について「この選択肢は §1 の12タイプのいずれかとして自然な応答になり得るか？」を確認する。
- 該当する場合、その誤答は **直ちに NG**。次のいずれかの対応を取る:
  1. 誤答を generic statement (e) または topic-irrelevant (a) に書き換える
  2. 発話スクリプト自体を調整して、その応答タイプが不適切になるよう文脈を絞る

【既知の落とし穴：v2.4 で明確化された複数正解パターン】

落とし穴 ① 「右ですよね？」確認質問 + Type 9 意図表明 distractor
- 発話: "The welcome event is in the gym, right?"
- 正解 (C) "Actually, it moved to the auditorium." [Type 6 訂正]
- ❌ 競合 (A) "I plan to attend it." [Type 9 意図] ← 確認質問への完全に自然な応答
- 教訓: 「Yes/No 確認」を発話に使う場合、Type 9 (意図) や Type 4 (条件付き承諾) の
  distractor は正解として競合する。以下のどちらかで対処:
  - 発話を確認質問ではなく断定文 ("The welcome event will be in the gym.") にして
    Type 6 訂正のみが自然な応答になるよう絞る
  - distractor を一般論 (e) や別話題 (a) に書き換える

落とし穴 ② "...this weekend." 計画報告 + Type 10 体験共有 distractor
- 発話: "I was planning to take the train downtown this weekend."
- 正解 (B) "The express bus is much cheaper than the train." [Type 7 代替案]
- ❌ 競合 (C) "I went downtown last weekend with friends." [Type 10 体験共有]
- 教訓: 計画報告 ("I'm going to ...", "I was planning to ...") は Type 7 代替案、
  Type 10 体験共有、Type 2 情報提供 のいずれでも応答可能。3つすべてが distractor
  に並ぶと複数正解になる。必ず2つを (a)〜(e) のどれかに書き換える。

落とし穴 ③ 「クラブ募集中」報告 + Type 12 暗示的断り distractor
- 発話: "The poetry club is looking for new members this semester."
- 正解 (D) "I might stop by their meeting tomorrow then." [Type 9 意図]
- ❌ 競合 (C) "I joined the debate club last year instead." [Type 12 暗示的断り]
  ("instead" が暗示的断りとして完全に自然)
- 教訓: 募集/勧誘の発話に対して、Type 9 (参加意図) も Type 12 (暗示的断り) も
  対称的に自然な応答。distractor 設計時、"instead", "already", "actually I..."
  などの暗示的断り marker を含む選択肢は除外する。

落とし穴 ④【v2.4.1 追加 — 既存88問監査で実検出】「集団行動への誘い」+「一人行動表明」
- 発話例:
  - "Would you like to form a study group?"
  - "Did you find a study group for the midterm?"
  - "Are you joining the debate club this semester?"
- 正解例: "Great idea! Some others might join." [Type 9/4 承諾]
        / "Yes — I joined one that meets twice a week." [Type 10 体験]
- ❌ 競合: "I always study alone at home."
        / "I prefer to study on my own most of the time."
        / "I usually do my own thing."
  → これらは Type 12 暗示的断り（一人派なので不参加）として 100% 自然
- 教訓: グループ参加/勉強会/クラブ加入など **集団行動への誘い** を発話に使う場合、
  "alone" / "by myself" / "on my own" / "I prefer to..." を含む選択肢は
  **必ず除外** する。代わりに **科目内容の一般陳述 (e)** や
  **事実情報 (e)**、**無関係話題 (a)** を distractor に使う。
  例: "Organic chemistry has a lot of memorization." (e)
      "The midterm covers chapters four through seven." (e)

特に注意すべきパターン (再掲＋追加):
- 招待/依頼 → Type 4 承諾系 distractor が競合
- ニュース/報告 → Type 9 意図表明 / Type 10 体験共有 distractor が競合
- 質問 → Type 1 間接回答 / Type 11 不確実性 distractor が競合
- 確認質問 ("..., right?") → Type 4/9/12 すべてが競合候補
- 計画報告 ("I'm planning to...") → Type 7/9/10 が競合候補
- 募集/勧誘 → Type 9 と Type 12 が対称的に成立しやすい
- 集団行動の誘い → "alone" / "on my own" / "I prefer to..." 系 distractor は **全面禁止** (落とし穴 ④)

================================================================================
§4. 問題作成ルール

### 難易度（CEFR B1〜B2、Module 1 Routing Module）
- Q1-Q2: B1レベル（基本的な日常会話、明確な意図）
- Q3-Q5: B1-B2ブリッジ（やや間接的な表現、文脈推測が必要）
- Q6-Q8: B2レベル（暗示的な意味、語用論的理解が必要）

### 話者の発話（音声スクリプト）
- 1文の短い質問または発言（約5秒以内）
- キャンパスライフに関連する場面
- Woman と Man を交互に配置（Q1=Woman, Q2=Man, Q3=Woman, ...）
- 自然な口語表現を使用（フォーマルすぎない）

### 正解の応答
- §1のResponse Typologyから1つのタイプを選び、そのタイプに沿った応答を作成する
- 教科書的な直接回答は避ける
- 文脈から意味を推測する必要がある回答を優先（特にB2レベル）

### 選択肢のフォーマットルール（v2.2.1更新）
- 全選択肢は3〜10語の短い1文またはフレーズで構成すること
- 3〜6語の短い応答も自然な会話では一般的であり、積極的に使うこと
  - ✅ "Every 30 minutes."（3語）
  - ✅ "No, that's not necessary."（5語）
  - ✅ "Let's check the schedule online."（5語）
  - ✅ "She arrived this afternoon."（4語）
- 8問全てが7語以上の長い選択肢ばかりにならないよう、短い問題と長い問題を混ぜること
- 目安: 8問中少なくとも3問は選択肢の平均語数が6語以下になるようにする
- ダッシュ（—）やセミコロン（;）で2つの文をつなげない
- カンマで2つの独立節（S+V, S+V）をつなげない（カンマスプライス禁止）
  - ※ ただし "I agree, ..." "Sure, ..." "Well, ..." 等の会話の相槌＋本文は許容
  - ※ 判断基準: カンマの前後を独立した文として読めるならNG
- 正解と不正解で文の長さに明らかな差が出ないようにする
- 正解が他の選択肢より目立って長い・複雑にならないこと

### ETS公式サンプル準拠の良い例
✅:
Q: "Didn't I just see you in the library an hour ago?"
(A) As a matter of fact, I was returning a book. [8語]
(B) Yes, you can find it in the reference section. [9語]
(C) I don't think I'll have enough time to do that. [10語]
(D) Actually, I think I can get there a little earlier. [10語]

### 悪い例
❌:
(A) The lab is open.（短すぎる — 4語）
(B) I think you should go to the second floor because there's usually more space up there and it's quieter too.（長すぎる — 18語）

### 正解分布
- A = 2問、B = 2問、C = 2問、D = 2問（完全均等）
- **正解順序の多様性（必須）**: 直前2セットの正解順序パターンと完全一致させないこと。
  例: 直前2セットが共に `A,B,C,D,A,B,C,D` の場合、同じシーケンスは NG。
  確認方法: 直前2セットの answers.html から `correct: [0-3]` の順列を取り出し、自分のセットと照合する。

### 誤答（Distractor）の設計原則 — 5 分類
- (a) 音の類似（phonetic trap）: 発話中の単語と似た音を含むが意味が合わない
- (b) 話題の関連（topic trap）: 同じトピックだが質問に答えていない
- (c) 文法的に正しいが不適切（pragmatic trap）: 文として成立するが応答として不自然
- (d) 過剰推論（inference trap）: もっともらしいが発話の意図を誤解
- (e) 一般陳述（generic statement）: トピックに関する事実だが個人的応答ではない

================================================================================
§5. 出力ファイルと形式

### 録音用スクリプト (docs/scripts/lcr-practice-{N}-scripts.md) のフォーマット

```
========================================
TOEFL iBT - Listen and Choose a Response
Module 1 (Routing Module) — AUDIO SCRIPTS
Practice {N}

Question 1 (B1) - WOMAN
Response Type: Type X（名称）
Filename: lcr-q1.mp3
Voice: [Voice Name] / [Accent]
Image: 女性①
Script: "[スクリプト]"

HTML Choices:
(A) [選択肢A — 3〜10語] [語数]
(B) [選択肢B — 3〜10語] [語数]
(C) [選択肢C — 3〜10語] [語数]
(D) [選択肢D — 3〜10語] [語数]

Answer: (X)

Distractor Justification Table (v2.4 必須):
| 選 | 表面 Type 判定                    | 不適切理由 (a〜e) + 1文            | 通過 |
| A  | Type X / 該当なし                | (X) [なぜこの場面の応答にならないか] | ✅/❌ |
| B  | Type X / 該当なし                | (X) [なぜこの場面の応答にならないか] | ✅/❌ |
| C  | Type X / 該当なし                | (X) [なぜこの場面の応答にならないか] | ✅/❌ |
| D  | Type X / 該当なし                | (X) [なぜこの場面の応答にならないか] | ✅/❌ |

→ 正解以外の3つすべてに不適切理由 (a〜e) を明記すること。
→ 「Type X として自然」と判定された distractor が1つでもあれば、
  選択肢を書き換える or 発話を絞り込んで再生成する。

不適切理由の分類:
  (a) topic trap     — 話題自体が無関係
  (b) phonetic trap  — 音が似た語の罠
  (c) pragmatic trap — 話題は同じだが発話の意図に答えていない
  (d) inference trap — 発話にない前提を追加
  (e) generic        — 一般論・定義・事実陳述で応答機能なし

[Q2-Q8 も同様の形式で続く]

========================================
ANSWER KEY
Q1: (X) [正解テキスト]
...
Q8: (X) [正解テキスト]
Distribution: A=2, B=2, C=2, D=2

========================================
RESPONSE TYPE DISTRIBUTION
Q1: Type X（名称）
...
Q8: Type X（名称）
Types used: X/12 (minimum 6)

========================================
DIFFICULTY DISTRIBUTION
B1: Q1, Q2
B1-B2: Q3, Q4, Q5
B2: Q6, Q7, Q8
```

================================================================================
§6. 話者画像と声のマッピングルール

### 画像ストック（8枚: 女性4枚 + 男性4枚）
- Base64エンコードしてHTMLに埋め込む（HTML生成時のみ）
- 各問題に1枚を固定で割り当て（ランダムではない）

### 画像↔声の1:1マッピング（必須）
- 1つの画像には必ず1つの声が紐づく
- 同じ画像が別の問題で使われる場合、必ず同じ声を使う
- 異なる画像に同じ声を使うのはNG

### アクセント分布ルール
8問で以下の4アクセントを織り交ぜる:
- American（アメリカ）: 3〜4問
- British（イギリス）: 1〜2問
- Australian（オーストラリア）: 1〜2問
- New Zealand（ニュージーランド）: 0〜1問
- 女性4問・男性4問それぞれで少なくとも2種類のアクセントを使用

### 割り当て例
| Q# | Speaker | 画像 | Voice | Accent |
|----|---------|------|-------|--------|
| Q1 | WOMAN | 女性① | Alice | American |
| Q2 | MAN | 男性① | George | American |
| Q3 | WOMAN | 女性② | Charlotte | British |
| Q4 | MAN | 男性② | Daniel | British |
| Q5 | WOMAN | 女性③ | Lily | Australian |
| Q6 | MAN | 男性③ | Callum | Australian |
| Q7 | WOMAN | 女性④ | Sarah | American |
| Q8 | MAN | 男性④ | Chris | New Zealand |

================================================================================
§7. 過去の問題との重複チェック

**使用済みトピック一覧の出典**：`docs/topic-history.md` の「Listen and Choose a Response (LCR)」セクション（Practice 1-10 まで全トピックを記録）。新規セット作成前に必ず参照。

【絶対回避ルール — Practice 2-10 リリース後監査の結果】

(1) **Q1 開始フレーズの多様化**
- 既存：`Excuse me, do you know …` が Q1 で 4回（p2, p3, p7, p8）／`Excuse me, …` 始まりが 6/9 練習。
- 新規 Q1 は以下から選び、上記パターンを回避：
  - 直接疑問詞（Where/What/When/How can I …?）
  - 状況説明（I just realized …、I bought … but …）
  - 観察共有（Did you hear …、Have you noticed …）
  - 困りごと表明（I'm having trouble with …、I've been struggling to …）

(2) **使用済みフレーズ（ほぼ完全一致を禁止）**
- `My roommate keeps playing loud music late at night…`（p2Q3, p9Q2）
- `I'm (really) struggling with my calculus homework. Is there anywhere on campus I can get help?`（p7Q2, p10Q4）
- `Excuse me, do you know …` の完全パターン

(3) **集中トピックの回避**
過去10セットの出現回数：professor 6 / dorm 5 / calculus 3 / shuttle 3 / library 3 / study abroad 3 / parking ticket 2 / roommate 2 / financial aid 2。新規ではこれらを優先的に避ける。

(4) **文構造の分布目標**
過去10セット全72問：`I/I'm …` 44%・Others 22%・`Did you …` 10%・`Excuse me …` 8%・他 16%。新規セットでは `I/I'm …` < 50%、`Excuse me …` ≤ 1問。

================================================================================
§8. 検証チェックリスト

- [ ] **選択肢のフォーマット**
  - [ ] 全選択肢が3〜10語の短い1文で構成されている
  - [ ] ダッシュ（—）やセミコロン（;）で文をつなげていない
  - [ ] カンマで2つの独立節をつなげていない（相槌＋本文は許容）
  - [ ] 正解と不正解で文の長さに明らかな差がない（最長-最短 ≤ 4語）

- [ ] **正解の一意性（§3チェック済み — v2.4 厳格モード）**
  - [ ] **Distractor Justification Table** が全 8 問の scripts.md に明記されている
  - [ ] テーブル内、正解以外の3行すべてに不適切理由 (a〜e のいずれか) が記入済み
  - [ ] チェック1: 正解は発話に対する自然な応答である
  - [ ] チェック2: 各誤答は明確に不適切（5つの trap (a〜e) のいずれかに該当）
  - [ ] チェック2: "1ステップ test" — 各誤答を返した後の相手の発話が想像できない
  - [ ] チェック3: 語数の最長-最短差が4語以内
  - [ ] チェック4: 誤答が別のResponse Typeとして自然な応答になっていない
  - [ ] §3 落とし穴① 確認質問 + Type 9 競合パターンを回避している
  - [ ] §3 落とし穴② 計画報告 + Type 7/9/10 競合パターンを回避している
  - [ ] §3 落とし穴③ 募集勧誘 + Type 9 vs 12 競合パターンを回避している
  - [ ] §3 落とし穴④ 集団行動の誘い + "alone/on my own/I prefer to..." 系 distractor を回避している

- [ ] **Response Typology**
  - [ ] 各問題にResponse Typeが明記されている
  - [ ] 8問で6タイプ以上カバーしている
  - [ ] 同じタイプが3回以上使われていない

- [ ] **正解分布**
  - [ ] A = 2問、B = 2問、C = 2問、D = 2問
  - [ ] 直前2セットと同一の正解順序パターンでない（§ 正解分布 参照）

- [ ] **難易度**
  - [ ] Q1-Q2: B1（基本的な日常会話）
  - [ ] Q3-Q5: B1-B2（やや間接的な表現）
  - [ ] Q6-Q8: B2（暗示的・語用論的理解）

- [ ] **画像↔声マッピング**
  - [ ] 1画像 = 1声（固定）
  - [ ] 少なくとも3種類のアクセントを使用
  - [ ] 男女で画像と声の性別が一致

- [ ] **過去セットとの重複（§7 参照）**
  - [ ] 使用済みトピックと重複していない（`docs/topic-history.md` で確認）
  - [ ] Q1 が `Excuse me, do you know …` で始まらない
  - [ ] §7(2) 禁止フレーズ（roommate loud music / calculus struggling 等）と一致しない
  - [ ] 開始構文の分布：`I/I'm …` < 50% (4問以下)、`Excuse me …` ≤ 1問
  - [ ] 集中トピック（professor/dorm/calculus/shuttle/library/study abroad/parking/roommate/financial aid）の使用は1セット内で1〜2問まで

================================================================================
END OF GUIDE (v2.4.1)

## 作成後
1. スクリプト＋問題＋Answer Keyを `docs/scripts/` に保存
2. HTML問題ページを作成（音声はプレースホルダー）
3. HTML解答ページを kickstart-hw 形式で作成（gradient header, score tracking, rich q-cards）
4. `docs/topic-history.md` のLCRセクションに使用したトピックを追記
5. 検証サマリーを表示:
   - Response Type分布（6+/12タイプ確認）
   - 正解分布（A=2,B=2,C=2,D=2確認）
   - 難易度分布（B1×2, B1-B2×3, B2×3確認）
   - 選択肢語数チェック（3-10語、差4語以内）
   - §3 全4チェック結果
   - 過去セットとの重複なし確認

## 音源ポーズ仕様（必読）
スクリプトを TTS（ElevenLabs 等）に渡す前に、必ずターン交代・文間に
SSML の `<break time="..."/>` を明示すること。ターン交代のデフォルトは
**400–600 ms**、熟考系は 800–1200 ms、上限 1500 ms。詳細は
`docs/audio-pause-spec.md` を参照。

生成後は `python3 audit_audio.py` で 250 ms 未満 / 1500 ms 超の
ポーズが残っていないことを必ず確認。残っている場合は
`python3 normalize_audio.py` で正規化。
