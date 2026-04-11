Build a Sentence の新しい問題セットを作成してください。

## 事前準備（自動実行）
1. `docs/topic-history.md` を読み、Build a Sentenceセクションの使用済みトピックを確認する
2. `writing/sentence/` フォルダ内の既存ファイルを確認する
3. 既存ファイルのHTML構造・CSS・JSを踏襲する

## 指定
$ARGUMENTS
- 例: `16` → 16問で生成
- 例: `14 travel` → 14問、旅行トピック中心
- 例: 空 → 18問（デフォルト）、トピックランダム

## 出力ファイル
1. `writing/sentence/practice-{N}.html` — ドラッグ＆ドロップ形式HTML
2. `writing/sentence/practice-{N}.md` — 問題文＋Answer Key

## Build a Sentence 問題仕様 (v2.0)

### 概要
- 14-18問（指定可能、デフォルト18問）
- 会話形式: 相手の発話への返答を並べ替えで作成
- ドラッグ＆ドロップで単語をBlankに配置
- 制限時間: 問題数に応じて自動計算（14問=6分〜18問=8分）

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

### 問題数別の難易度目標
| 問題数 | Basic (5語) | Standard (6語) | Advanced (7語) |
|--------|------------|----------------|----------------|
| 14問 | 4問 | 6問 | 4問 |
| 15問 | 4〜5問 | 6〜7問 | 4問 |
| 16問 | 4〜5問 | 7問 | 4〜5問 |
| 17問 | 5問 | 7〜8問 | 4〜5問 |
| 18問 | 5〜6問 | 7〜8問 | 4〜5問 |

### 段階的配置ルール（必須）
- Basic問題を**序盤**（Q1〜Q5付近）に配置
- Standard問題を**中盤**（Q6〜Q13付近）に配置
- Advanced問題を**後半**（Q14〜Q18付近）に配置
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

### 作成後
1. HTML＋MDファイルを作成
2. 検証コード v2.0 実行（シャッフル、Blank数5-7、難易度分布、文構造バリエーション、段階的配置）
3. `docs/topic-history.md` のBuild a Sentenceセクションにトピック追記
4. 検証サマリー表示
