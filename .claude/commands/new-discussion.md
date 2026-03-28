Writing for an Academic Discussion の新しい問題を作成してください。

## 事前準備（自動実行）
1. `docs/history-writing.md` を読み、Academic Discussionセクションの使用済みトピックを確認する
2. `day3/` フォルダ内の既存academic-discussionファイルを確認する
3. 既存ファイルのHTML構造・CSS・JSを踏襲する

## 指定
$ARGUMENTS
- 例: `sociology volunteerism` → 社会学、ボランティアリズムのトピック
- 例: `alternative` → Alternative Question タイプで生成
- 例: `free-response business` → Free-response、経営学分野
- 例: 空 → 全てランダム（Alternative 75%, Free-response 25%）

## 出力ファイル
1. `day3/academic-discussion-{N}.html` — インタラクティブHTML
2. `day3/academic-discussion-{N}.md` — 問題文MD

## Academic Discussion 問題仕様

### 概要
- 教授の投稿（問題提起）＋学生2人の投稿（異なる立場）を読む
- 受験者が自分の意見を100語以上で投稿する
- 10分タイマー

### 問題構成
| パート | 語数 |
|---|---|
| 教授の投稿 | 60-80語（厳守） |
| 学生1の投稿 | 40-60語（厳守） |
| 学生2の投稿 | 40-60語（厳守） |

### 問題文（固定テキスト — [学問分野]のみ変更）
```
Your professor is teaching a class on [学問分野]. Write a post responding to the professor's question.

In your response, you should do the following.
• Express and support your opinion.
• Make a contribution to the discussion in your own words.

An effective response will contain at least 100 words.
```

### 質問タイプ
**Alternative Question（75%）:**
- 「どちらが良いか」「賛成か反対か」
- 学生2人は対立する立場
- 例: "Should high school students be required to do volunteer work? Why or why not?"

**Free-response Question（25%）:**
- 新しい視点・追加要素を求める開放的質問
- 学生2人は異なる観点
- 例: "What additional factors should companies consider?"

### 学問分野（以下から選択またはランダム）
Sociology, Psychology, Environmental Science, Business Management, Education, Urban Planning, Communications, Public Policy, Technology Studies, Health Sciences, Social Studies

### 名前の多様性
- 教授: Dr. Chen, Dr. Rodriguez, Dr. Nakamura, Dr. Okafor, Dr. Petrov 等
- 学生: Marcus, Sarah, Emma, Priya, Kenji, Aisha, Carlos, Claire 等

### 品質基準
- 現実的で関連性の高いトピック
- 2人の学生意見が明確に異なる
- 各意見に説得力ある理由
- 政治的に偏らない中立的トピック
- 教授はフォーマル、学生はややカジュアル

### 語数検証（必須・コードで実行）
```python
def verify_discussion(professor_text, student1_text, student2_text):
    errors = []
    prof_wc = len(professor_text.split())
    s1_wc = len(student1_text.split())
    s2_wc = len(student2_text.split())
    
    print(f"Professor: {prof_wc} words", "✅" if 60 <= prof_wc <= 80 else "❌")
    print(f"Student 1: {s1_wc} words", "✅" if 40 <= s1_wc <= 60 else "❌")
    print(f"Student 2: {s2_wc} words", "✅" if 40 <= s2_wc <= 60 else "❌")
    
    if not (60 <= prof_wc <= 80): errors.append(f"Professor: {prof_wc} (need 60-80)")
    if not (40 <= s1_wc <= 60): errors.append(f"Student 1: {s1_wc} (need 40-60)")
    if not (40 <= s2_wc <= 60): errors.append(f"Student 2: {s2_wc} (need 40-60)")
    
    if errors:
        for e in errors: print(f"  ❌ {e}")
        return False
    print("  ✅ ALL PASSED")
    return True
```

### HTML仕様
- 既存の academic-discussion.html の構造を完全に踏襲
- ヘッダー: 左「Writing」、右にタイマー＋Finishボタン
- Page 0: Instruction（説明＋Startボタン）
- Discussion Page: 左パネル（教授投稿＋学生投稿）＋右パネル（テキストエリア＋ツールバー）
- Completion Page: 回答プレビュー＋Word Count＋使用時間
- フッター: Reset All
- auth.js連携

### 作成後
1. HTML＋MDファイルを作成
2. 語数検証をPythonで実行（教授60-80語、学生各40-60語）
3. `docs/history-writing.md` のAcademic Discussionセクションにトピック・分野・質問タイプを追記
4. サマリー表示: 学問分野、質問タイプ、教授名、学生名、語数結果
