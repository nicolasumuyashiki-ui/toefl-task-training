Build a Sentence の新しい問題セットを作成してください。

## 事前準備（自動実行）
1. `docs/history-writing.md` を読み、Build a Sentenceセクションの使用済みトピックを確認する
2. `day3/` フォルダ内の既存build-sentenceファイルを確認する
3. 既存ファイルのHTML構造・CSS・JSを踏襲する

## 指定
$ARGUMENTS
- 例: `16` → 16問で生成
- 例: `14 travel` → 14問、旅行トピック中心
- 例: 空 → 18問（デフォルト）、トピックランダム

## 出力ファイル
1. `day3/build-sentence-{N}.html` — ドラッグ＆ドロップ形式HTML
2. `day3/build-sentence-{N}.md` — 問題文＋Answer Key

## Build a Sentence 問題仕様

### 概要
- 14-18問（指定可能、デフォルト18問）
- 会話形式: 相手の発話への返答を並べ替えで作成
- ドラッグ＆ドロップで単語をBlankに配置
- 制限時間: 問題数に応じて自動計算（14問=6分〜18問=8分）

### 問題形式
- 固定単語: 文頭または文末に1-2語（最大2語）
- Blank数 = Word Bank単語数（完全一致、5-7語程度）
- Word Bankは正解順からシャッフル必須

### データ構造
```javascript
{
    id: 1,
    prompt: "相手の発話",
    speakerGender: "female", // or "male"
    fixedStart: "文頭固定語（空可）", // 最大2語
    fixedEnd: "文末固定語（空可）",   // 最大2語
    blanks: ["単語1", "単語2", ...],  // 正解順
    answer: ["単語1", "単語2", ...]   // blanksと同じ
}
```

### 句読点ルール（厳守）
- 冒頭表現（Yes, No, Sure, Well, Actually）の後にコンマ必須
  - fixedStart: "Sure," ← 正しい / fixedStart: "Sure" ← 間違い
- 等位接続詞（and, but, or, so）で独立節を繋ぐ場合、接続詞前にコンマ
  - blanks内: ["was", "nervous", "at first,", "but", "it", "went"]

### 話者画像
- speakerGenderに応じてfemale/maleからランダム割り当て
- 同性別が連続重複しないよう制御
- 丸枠60x60px、プロンプト左側配置

### 文構造バリエーション
- 否定文: I do not / did not
- 関係代名詞: who / that / which
- 不定詞: to know / to start
- 前置詞句: in my opinion / at cooking
- 複合語: "tour guides", "showed us around"（1つのWord Bankアイテム）

### HTML仕様
- 既存の build-sentence.html の構造を完全に踏襲
- ヘッダー: 左「Writing」、右にタイマー＋Finishボタン（赤）
- Page 0: Instruction（説明＋Startボタン）
- Question Page: Prompt（吹き出し）＋Answer Area（上）＋Word Bank（下）
- Previous/Nextナビゲーション、最終問題でFinish
- Finishボタン: 確認ポップアップ付き
- Results Page: スコア＋正誤詳細＋正解文
- フッター: Check All Answers / Reset All / Show All Answers
- auth.js連携

### 検証コード（必須実行）
```python
def verify_build_sentence(problems):
    all_passed = True
    for p in problems:
        errors = []
        if p.get('word_bank') == p['answer']:
            errors.append("Word Bank not shuffled")
        if len(p.get('word_bank', [])) != len(p['answer']):
            errors.append("Word Bank count mismatch")
        parts = []
        if p['fixedStart']: parts.append(p['fixedStart'])
        parts.extend(p['answer'])
        if p['fixedEnd']: parts.append(p['fixedEnd'])
        sentence = ' '.join(parts)
        openers = ["Yes ", "No ", "Sure ", "Well ", "Actually "]
        for opener in openers:
            if sentence.startswith(opener):
                errors.append(f"Missing comma after '{opener.strip()}'")
        status = "✅" if not errors else "❌"
        print(f"{status} Q{p['id']}: {sentence}")
        if errors:
            for e in errors: print(f"   ERROR: {e}")
            all_passed = False
    return all_passed
```

### 作成後
1. HTML＋MDファイルを作成
2. 検証コード実行（シャッフル確認、単語数一致、句読点チェック）
3. `docs/history-writing.md` のBuild a Sentenceセクションにトピック追記
4. 検証サマリー表示
