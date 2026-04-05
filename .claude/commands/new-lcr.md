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
TOEFL iBT - Listen and Choose a Response 問題作成ガイド v2.2.1（Module 1 — Routing Module）

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
[RETAINED] 選択肢の語数ルール 5〜10語（v2.1準拠）
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
§3. 正解の一意性チェックルール（複数正解の防止）

問題作成後、以下の4段階チェックを必ず実施すること:

### チェック1: 正解の応答適切性
- 正解選択肢を発話スクリプトと組み合わせて声に出して読み、自然な2人の会話として成立するか確認する。
- 「この返答を聞いて、会話が自然に続けられるか？」が基準。

### チェック2: 誤答の排他性
- 各誤答選択肢についても同様に発話と組み合わせて読み、「これも正解として成立しないか？」を確認する。
- もし誤答が「状況次第では自然な応答になり得る」場合、その選択肢を修正するか、発話スクリプト自体を調整する。
- 具体的には、誤答が以下のいずれかに該当すれば安全:
  - (a) 発話の話題と無関係な内容を含む（topic trap）
  - (b) 発話中の単語に音が似た語を使っているが意味が合わない（phonetic trap）
  - (c) 同じ話題だが、発話の意図（質問/依頼/報告等）に答えていない（pragmatic trap）
  - (d) もっともらしいが、発話にない前提を勝手に追加している（inference trap）

### チェック3: 長さ・複雑さの均一性
- 4つの選択肢の語数を数え、最長と最短の差が4語以内であることを確認する。
- 正解だけが明らかに長い・短い・複雑な構文になっていないか確認する。

### チェック4: Distractor Response Type排他性チェック（v2.2.1追加）
- 各誤答について「この選択肢は§1の12タイプのいずれかとして自然な応答になり得るか？」を確認する。
- もし誤答が別のResponse Typeとして成立する場合（例: 正解がType 12の暗示的断りだが、誤答がType 4の条件付き承諾として自然に読める）、その誤答は修正が必要。
- 安全な誤答の条件:
  - (a) 12タイプのいずれにも当てはまらない（= 会話の応答として機能しない）
  - (b) または、発話の話題/意図から明らかにずれているため、たとえ文としてはTypeに当てはまっても「この場面での応答」としては不自然
- 特に注意すべきパターン:
  - 招待/依頼に対する問題 → 「承諾」系のdistractorが正解と競合しやすい
  - ニュース/報告に対する問題 → 「自分への影響を述べる」distractorが正解と競合しやすい
  - 質問に対する問題 → 「間接回答」系のdistractorが正解と競合しやすい

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
- 全選択肢は5〜10語の短い1文で構成すること
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

### 誤答（Distractor）の設計原則
- 音の類似（phonetic trap）: 発話中の単語と似た音を含む
- 話題の関連（topic trap）: 同じトピックだが質問に答えていない
- 文法的に正しいが不適切（pragmatic trap）: 文として成立するが応答として不自然
- 過剰推論（inference trap）: もっともらしいが発話の意図を誤解

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
(A) [選択肢A — 5〜10語] [語数]
(B) [選択肢B — 5〜10語] [語数]
(C) [選択肢C — 5〜10語] [語数]
(D) [選択肢D — 5〜10語] [語数]

Answer: (X)
Rationale: [正解の理由 + 各誤答がなぜ不正解かの簡潔な説明]
Uniqueness Check: [正解が唯一の自然な応答である理由を1文で]

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

以下のトピック/シーンは過去に使用済みなので避けること:

- Set 1: 図書館、バス停、カスタマーサービス、夜の予定、郵便局、電話番号、週末の店、セミナー
- Set 2: 来学期スケジュール、書店の教科書、プレゼン場所、教授退職、専攻変更、キャンパスシャトル、学生証、カフェテリア
- Set 3: 卒業式登録、自販機、キャンパス交通手段、プレゼンリハーサル、フォーム入手、美術展、図書館ポリシー変更、試験レビュー
- Set 4: コンピューターラボ、ジム施設、奨学金締切、ルームメイト騒音、チューターセンター、駐車場建設、グループプロジェクト、奨学金返金
- Set 5: 教授オフィスアワー、夏のインターンシップ、カフェ閉鎖、オンライン登録、静かな勉強場所、教科書購入、体調不良、追加点数
- Set 6: Lost and found、化学セクション間違い、Financial aid行列、Intramural sports、Dorm Wi-Fi、Art studio時間変更、Academic advisor助言、Volunteer hours未記録

================================================================================
§8. 検証チェックリスト

- [ ] **選択肢のフォーマット**
  - [ ] 全選択肢が5〜10語の短い1文で構成されている
  - [ ] ダッシュ（—）やセミコロン（;）で文をつなげていない
  - [ ] カンマで2つの独立節をつなげていない（相槌＋本文は許容）
  - [ ] 正解と不正解で文の長さに明らかな差がない（最長-最短 ≤ 4語）

- [ ] **正解の一意性（§3チェック済み）**
  - [ ] チェック1: 正解は発話に対する自然な応答である
  - [ ] チェック2: 各誤答は明確に不適切（4つのtrapのいずれかに該当）
  - [ ] チェック2: 誤答が「状況次第で正解になり得る」ケースがない
  - [ ] チェック3: 語数の最長-最短差が4語以内
  - [ ] チェック4: 誤答が別のResponse Typeとして自然な応答になっていない

- [ ] **Response Typology**
  - [ ] 各問題にResponse Typeが明記されている
  - [ ] 8問で6タイプ以上カバーしている
  - [ ] 同じタイプが3回以上使われていない

- [ ] **正解分布**
  - [ ] A = 2問、B = 2問、C = 2問、D = 2問

- [ ] **難易度**
  - [ ] Q1-Q2: B1（基本的な日常会話）
  - [ ] Q3-Q5: B1-B2（やや間接的な表現）
  - [ ] Q6-Q8: B2（暗示的・語用論的理解）

- [ ] **画像↔声マッピング**
  - [ ] 1画像 = 1声（固定）
  - [ ] 少なくとも3種類のアクセントを使用
  - [ ] 男女で画像と声の性別が一致

- [ ] **過去セットとの重複**
  - [ ] 使用済みトピックと重複していない

================================================================================
END OF GUIDE (v2.2.1)

## 作成後
1. スクリプト＋問題＋Answer Keyを `docs/scripts/` に保存
2. HTML問題ページを作成（音声はプレースホルダー）
3. HTML解答ページを kickstart-hw 形式で作成（gradient header, score tracking, rich q-cards）
4. `docs/topic-history.md` のLCRセクションに使用したトピックを追記
5. 検証サマリーを表示:
   - Response Type分布（6+/12タイプ確認）
   - 正解分布（A=2,B=2,C=2,D=2確認）
   - 難易度分布（B1×2, B1-B2×3, B2×3確認）
   - 選択肢語数チェック（5-10語、差4語以内）
   - §3 全4チェック結果
   - 過去セットとの重複なし確認
