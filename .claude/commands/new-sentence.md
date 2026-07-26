Build a Sentence の新しい問題セットを作成してください。

## 事前準備（自動実行）
1. `docs/topic-history.md` を読み、Build a Sentenceセクションの使用済みトピックを確認する
2. `writing/sentence/` フォルダ内の既存ファイルを確認する
3. 既存ファイルのHTML構造・CSS・JSを踏襲する

## 指定
$ARGUMENTS
- **問題数は 10 問固定（ETS 2026 公式仕様）。引数で変更しない。**
- 例: `travel` → 旅行トピック中心（10問）
- 例: 空 → トピックランダム（10問）

## 出力ファイル
1. `writing/sentence/practice-{N}.html` — ドラッグ＆ドロップ形式HTML
2. `writing/sentence/practice-{N}.md` — 問題文＋Answer Key

## Build a Sentence 問題仕様 (v2.0)

### 概要
- **10問固定**（ETS 2026 公式仕様。問題数は指定・増減しない）
- 会話形式: 相手の発話への返答を並べ替えで作成
- ドラッグ＆ドロップで単語をBlankに配置
- 制限時間: 7分（420秒）固定・各1点（ETS 2026 仕様）

### 問題形式
- 固定単語: 文頭または文末に1-2語（最大2語）
- **Blank数 = Word Bank単語数 = 5〜7語（厳守）**
  - 4語以下は禁止（簡単すぎる）
  - 8語以上は禁止（ドラッグ操作が困難）
- Word Bankは正解順からシャッフル必須

### 難易度バランス基準
| レベル | Blank数 | 文構造の特徴 |
|--------|---------|-------------|
| Basic | 5語 | 単純なSVO構造、基本時制 |
| Standard | 6語 | 関係代名詞、不定詞、句動詞、否定構文を含む |
| Advanced | 7語 | 複雑な文構造（関係節+修飾、接続詞による複文など） |

### 難易度目標（10問固定）
| 問題数 | Basic (5語) | Standard (6語) | Advanced (7語) |
|--------|------------|----------------|----------------|
| 10問 | 3問 | 4問 | 3問 |

### 段階的配置ルール（必須）
- Basic問題を**序盤**（Q1〜Q3）に配置
- Standard問題を**中盤**（Q4〜Q7）に配置
- Advanced問題を**後半**（Q8〜Q10）に配置
- 段階的に難しくなる構成にすること

### 文構造バリエーション（最低要件）
- 関係代名詞 (who/that/which): **最低1問**
- 不定詞 (to + verb): **最低2問**
- 句動詞 (phrasal verb): **最低1問**
- 否定文 (not): **最低1問**
- 接続詞 (since/but/and/so/because): **最低1問**

### データ構造
```javascript
{
    id: 1,
    prompt: "相手の発話",
    speakerGender: "female", // or "male"
    fixedStart: "文頭固定語（空可）", // 最大2語
    fixedEnd: "文末固定語（空可）",   // 最大2語
    blanks: ["単語1", "単語2", ...],  // 正解順（5〜7語）
    answer: ["単語1", "単語2", ...],  // blanksと同じ
    altAnswers: [["別解の順序"]]      // 省略可
}
```

### 複数正解（altAnswers）対応ルール
- 並列構造（both A and B, X or Y, A, B, and C）で順序入替が可能な場合は `altAnswers` を定義
- 採点ロジック: `answer` OR `altAnswers` のいずれかに一致すれば正解
- 新規作成時は全問について別解の有無を必ず検証すること

### 句読点ルール（厳守）
- 冒頭表現（Yes, No, Sure, Well, Actually, Unfortunately）の後にコンマ必須
  - fixedStart: "Sure," ← 正しい / fixedStart: "Sure" ← 間違い
- 等位接続詞（and, but, or, so）で独立節を繋ぐ場合、接続詞前にコンマ
  - blanks内: ["was", "nervous", "at first,", "but", "it", "went"]

### 話者画像
- speakerGenderに応じてfemale/maleからランダム割り当て
- 同性別が連続重複しないよう制御
- 丸枠60x60px、プロンプト左側配置

### HTML仕様
- 既存の practice-1.html の構造を完全に踏襲
- ヘッダー: 左「Writing」、右にタイマー＋Finishボタン（赤）
- Page 0: Instruction（説明＋Startボタン）
- Question Page: Prompt（吹き出し）＋Answer Area（上）＋Word Bank（下）
- Previous/Nextナビゲーション、最終問題でFinish
- Finishボタン: 確認ポップアップ付き
- Results Page: スコア＋正誤詳細＋正解文
- フッター: Check All Answers / Reset All / Show All Answers
- auth.js連携

### 検証コード（必須実行）v2.0
```python
def verify_build_sentence(problems):
    """Build a Sentence問題の総合検証（難易度分布・文構造チェック付き）v2.0"""
    all_passed = True
    for p in problems:
        errors = []
        if p.get('word_bank') == p['answer']:
            errors.append("Word Bank not shuffled")
        if len(p.get('word_bank', [])) != len(p['answer']):
            errors.append("Word Bank count mismatch")
        bc = len(p['answer'])
        if bc < 5 or bc > 7:
            errors.append(f"Blank count out of range: {bc} (must be 5-7)")
        parts = []
        if p['fixedStart']: parts.append(p['fixedStart'])
        parts.extend(p['answer'])
        if p['fixedEnd']: parts.append(p['fixedEnd'])
        sentence = ' '.join(parts)
        openers = ["Yes ", "No ", "Sure ", "Well ", "Actually ", "Unfortunately "]
        for opener in openers:
            if sentence.startswith(opener) and not sentence.startswith(opener.strip() + ","):
                errors.append(f"Missing comma after '{opener.strip()}'")
        if p['fixedStart']:
            fs_count = len(p['fixedStart'].replace(',','').split())
            if fs_count > 2: errors.append(f"fixedStart too long: {fs_count} words (max 2)")
        if p['fixedEnd']:
            fe_count = len(p['fixedEnd'].replace('.','').replace('!','').split())
            if fe_count > 2: errors.append(f"fixedEnd too long: {fe_count} words (max 2)")
        status = "✅" if not errors else "❌"
        print(f"{status} Q{p['id']}: {sentence}")
        if errors:
            for e in errors: print(f"   ❌ {e}")
            all_passed = False

    # 難易度分布チェック
    n = len(problems)
    basic = sum(1 for p in problems if len(p['answer']) == 5)
    standard = sum(1 for p in problems if len(p['answer']) == 6)
    advanced = sum(1 for p in problems if len(p['answer']) == 7)
    print(f"\nDifficulty: Basic={basic}, Standard={standard}, Advanced={advanced}")

    # 文構造バリエーションチェック
    ans_all = [' '.join(p['answer']) for p in problems]
    checks = {
        "Relative clause": sum(1 for a in ans_all if any(w in a.split() for w in ['who','that','which'])),
        "Infinitive": sum(1 for a in ans_all if ' to ' in a),
        "Negative": sum(1 for a in ans_all if 'not' in a.split()),
        "Conjunction": sum(1 for a in ans_all if any(w in a.split() for w in ['since','but','and','so','because'])),
    }
    for k, v in checks.items():
        print(f"  {'✅' if v >= 1 else '❌'} {k}: {v}")

    # 段階的配置チェック
    first = problems[:n//3]
    last = problems[-(n//3):]
    avg_f = sum(len(p['answer']) for p in first) / len(first)
    avg_l = sum(len(p['answer']) for p in last) / len(last)
    print(f"\nProgressive: first_avg={avg_f:.1f}, last_avg={avg_l:.1f} {'✅' if avg_l > avg_f else '❌'}")
    return all_passed
```

## 🆕 §K 会話整合（DIALOGUE INTEGRITY）— ハード要件（v3.4・2026-07-15 制定）

**最重要**: response は「並べ替えパズル」である前に「**話者B の実際の発話**」である。prompt（話者A）と、生徒が組み立てる response（話者B）が**本当に2人の会話として成立**していなければならない。blank数・デコイと同格のハード要件とし、1つでも違反したらその問題は破棄して作り直す。構造検証コードでは検出できない（**必ず人／モデルの目視監査**）。

### 一人芝居バグ（root cause）
「文（response）を先に作り、prompt を後から貼る」と100%発生する。応答が**疑問文・依頼文**のとき特に壊れる。
> ❌ 実例: prompt「I'm new here and a little lost.」／response「Can you tell me where the main library is located?」
> → 迷っているのも尋ねているのも同一人物＝一人芝居。B の発話としてあり得ない。

### K-1 話者の定義
- 話者A＝prompt を言う人（画像・gender で表示される側）。話者B＝生徒が組み立てる response を言う人（＝生徒自身の立場）。**A と B は別人格**。B の発話が A の発話の続きとして読めてはならない。

### K-2 作問順序の固定（★後付け禁止）
① 場面と情報の非対称を1行で決める（A は何を知っている／知らないか、B は何を知っている／知らないか）→ ② B の発話（response）を決める → ③ それを引き出す最も自然な A の発話（prompt）を決める → ④ 固定語・blank・デコイを**最後に**当てる。**逆順（パターン先行・prompt後付け）で作らない。**

### K-3 情報非対称マトリクス
| A の発話（prompt） | ✅ 許容される B の応答 | ❌ 禁止される B の応答 |
|---|---|---|
| 質問（How was the lecture?） | 情報提供の平叙文 | 同じ内容を尋ね返す |
| 状況・体験の共有（I heard you moved.） | 質問／提案／コメント | A が述べた事実の単なる言い直し |
| **困りごと・無知の表明**（I'm new here and lost.） | 助け船・申し出・情報提供 | **同じ内容の依頼・質問（★一人芝居の典型）** |
| 申し出・依頼（Do you need help?） | 承諾／辞退／依頼疑問文 | 同じ申し出の繰り返し |

**核心**: 応答が疑問文・依頼文になるのは「**B が知らない情報を A が持っている**」場面に限る。A が「知らない・困っている」と表明した直後に B が同じことを尋ねてはならない。B が断定できるのは「B の体験・所有情報・一般共有事実」だけ。

### K-4 モノローグ検査（★全問必須）
prompt と response を**話者ラベルを外して1人の連続発話として音読**する。
- 自然な独り言としてスラスラ繋がる → **FAIL**（会話でない証拠・破棄）
- 1人では明らかに破綻する（＝2人でないと成立しない） → **PASS**

### K-5 代名詞・指示語の視点反転検査
prompt の `you`→response では `I/we`、prompt の `I/my`→response では `you/your`、`here/there`・`this/that` も話者位置で反転・維持を1語ずつ確認。

### K-7 解答ブロックに3行を必ず出力
```
会話整合監査:
  役割: A=[立場・既知] / B=[立場・既知] → 情報非対称 OK/NG
  応答タイプ: A=[質問/共有/困りごと/申し出] → B=[情報提供/質問/承諾/助け船] → マトリクス適合 OK/NG
  モノローグ検査: 1人の連続発話として読むと[破綻する=PASS / 自然に繋がる=FAIL]
```

## 🆕 prompt を改訂したら履歴再現を必ず残す（promptLegacy / PROMPT_REV・2026-07-15 制定）

既存問題の **prompt（会話文）を改訂**する場合、**採点対象（`blanks`/`answer`）を1文字も変えないなら旧版アーカイブは不要**だが、**改訂前に解いた生徒が「回答を見る」で当時の会話文のまま見返せる**ようにすること（参照実装: #163→#165、`writing/sentence/practice-{2,6}*.html`）。

1. 練習・解答ページの当該設問に **`promptLegacy`（改訂前の prompt）** を残す。
2. 解答ページに **`PROMPT_REV`（改訂の ISO 境界）** を持ち、復元した attempt の `ts`（タイムスタンプ）が境界より前なら **`promptLegacy` を表示**し「当時の問題文」タグ＋注記＋「▶ 当時の問題文で解き直す」リンクを出す。境界後・`ts` 無し（同一セッション直後）は現行 prompt。
3. attempt の `ts` は復元3層すべてで payload に載せる: `js/student-history.js`（別端末）・`js/admin-answer-overlay.js`（Admin）・`js/auth.js` シード（同端末＝`training_score.updatedAt`）。
4. 練習ページは **`?rev=legacy`**（`window.__TCK_REV_LEGACY`）で当時の prompt のまま解き直せるようにする。
5. **禁止**: `answer`/`blanks`（並べ替える語群・正解）を変えること。変える場合は CTW 同様の旧版アーカイブ＋era境界が必須（CLAUDE.md「旧版アーカイブ必須」参照）。

> ⚠️ 会話整合（§K）修正で prompt を直すときは、この再現ルールをセットで必ず適用する。生徒の取り組み履歴・スコアは**表示のみ**が変わり、サーバ ANSWERS・`training_score_*` には一切書き込まない（読み取り＋表示キャッシュのみ）。

### 作成後
1. HTML＋MDファイルを作成
2. 検証コード v2.0 実行（シャッフル、Blank数5-7、難易度分布、文構造バリエーション、段階的配置）
3. **§K 会話整合を全問目視監査**（モノローグ検査・情報非対称マトリクス・視点反転）し、解答ブロックに3行を出力
3. `docs/topic-history.md` のBuild a Sentenceセクションにトピック追記
4. 検証サマリー表示
