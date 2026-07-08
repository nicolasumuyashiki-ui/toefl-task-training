Complete the Words (CTW) の新しい問題セットを作成してください。

> ✅ **ETS 公式 TOEFL iBT 2026 仕様準拠済み（v3.5.2 / 公式逆解析ベース）**（最終確認: 2026-07-02 / 産屋敷確認済み）
> 本仕様は ETS 公式 "TOEFL iBT Practice Test 1"（2026 形式）Reading / Complete the Words の実データ
> （Module 1=10空所 / Module 2=10空所）を逆解析した結果に基づく。公式の全20空所が floor(n/2)
> アルゴリズムに例外なく一致した。公式から逸脱する変更を加える際は必ずこのバナーを更新すること。

## 事前準備（自動実行）
1. `docs/topic-history.md` を読み、CTW セクションの使用済みトピックを確認する
2. `reading/ctw/` フォルダ内の既存ファイルを確認し、次の Practice 番号を特定する
3. 使用済みトピックと重複しない **学術トピック** を2つ選定する（Set 1, Set 2）
4. 既存の `reading/ctw/practice-1-set-1.html` を読み、HTML/CSS/JS 構造を踏襲する

## 指定
$ARGUMENTS
- 例: `volcanoes, sleep science` → Set 1/2 のトピック指定
- 例: `random` or 空 → 全てランダム（学術）生成

## 出力ファイル
1. `reading/ctw/practice-{N}-set-1.html` — Set 1 HTML（**Module 1 / Routing**）
2. `reading/ctw/practice-{N}-set-2.html` — Set 2 HTML（**Module 2 HARDER**）
3. `reading/ctw/practice-{N}-answers.html` — 2セット分の解答解説ページ

═══════════════════════════════════════════════════════════════════════
CORE ALGORITHM（v3.5.2・最重要）
═══════════════════════════════════════════════════════════════════════

### 1. 削り方は floor(n/2) 固定（全モジュール共通・手調整禁止）
各空所語 w（文字数 n）について：
- **表示** `s = w[:n//2]`（先頭 floor(n/2) 文字）
- **解答** `a = w[n//2:]`（後半 ceil(n/2) 文字）
- 例: increase(8)→`incr|ease` / fungi(5)→`fu|ngi` / information(11)→`infor|mation` / of(2)→`o|f`
- **s/a は絶対に手入力しない**。必ず `split_word(w)` で導出する（ズレの温床を排除）。
- show%（表示率 ≒ 46%）は語長で機械的に決まる「結果」であり、難易度のツマミではない。

### 2. 難化は語彙のみ（削り方は M1/M2H で同一）
公式 Module 1 と Module 2 はどちらも **ans 平均 2.70 / show ~46%**。差は語彙だけ
（M2 は regions, involved, cognitive 等の学術語）。**show% を下げて難しくしない**。

### 3. 厳密な交互配置（＝空所は絶対に隣接しない）
`target` は **ちょうど 20 トークン**。**奇数位置（1,3,5,…＝0-indexed の偶数）＝空所（10）／
偶数位置＝完全表示（10）** を厳守。1語おきに削るだけ。
→ **各空所の両隣は必ず表示語**になり、文脈が常に残るため **解答が一意に定まる**。
（旧 v3.4 の「3連続禁止」より厳格。隣接そのものが起きない。）

### 4. 空所語の制約
- **len ≥ 2 のみ**（1文字語 `a` / `I` は表示文字が残らないので空所にしない → 偶数位置に置く）。
- **機能語・短語も空所対象**（is, its, into, with, such, that, only, from … OK）。内容語縛りは無い。
- **specialist 語（超専門語）は空所にしない**（hieroglyph, photosynthesis, chromosome 等）。表示語として本文に置くのは可。
- **各空所は文脈で一意に決まること**（letters が候補を絞り、context が確定する）。生成後に必ず確認（下記 VERIFICATION）。

═══════════════════════════════════════════════════════════════════════
PART 1: PASSAGE REQUIREMENTS
═══════════════════════════════════════════════════════════════════════
合計 **70–100 語**。**学術トピック**（無背景知識で読める短い expository）。
- `intro` : 1文以上の**完全文（空所なし）** ＝ 文脈導入
- `target`: **ちょうど 20 語**。奇数位置=空所(10) / 偶数位置=完全表示(10) の交互
- `conclusion` : **完全文（空所なし）**

トピック分野（Read an Academic Passage と共通）:
Biology / Astronomy / Geology / Physics / Chemistry / World History / Psychology /
Economics / Anthropology / Archaeology / Arts & Design 等。
❌ 日常・ハウツー・自己啓発（journaling, tidy room, saving money …）は不可（→ Read in Daily Life の領域）。

### モジュール差（語彙のみ）
| | Set 1 = Module 1 (Routing) | Set 2 = Module 2 HARDER |
|---|---|---|
| CEFR | B1–B2 | B2–C1 |
| 語彙 | 一般的な学術語＋機能語の自然な混在 | 低頻度・学術語（AWL 由来が理想）を数語混ぜる（cognitive, involved, regions, hypothesis, distribution …） |
| 診断バンド（結果） | ans 平均 2.3–3.3 / ans 最大 ≤5 / show ~40–52% | ans 平均 2.5–3.7 / ans 最大 ≤6 / show ~40–50% |
※ 公式 M2 は ans 平均 2.70 のまま難化している。**長語ばかり空所にせず、機能語の短い空所も自然に混ぜる**。
難しさは「語の特定」で出す。

═══════════════════════════════════════════════════════════════════════
PART 2: DATA STRUCTURE & AUTO-GENERATION
═══════════════════════════════════════════════════════════════════════
target は 20 個の dict。**ソースは {w, p, blank} のみ**。s/a は build 時に floor(n/2) で導出する。

```python
def split_word(w):
    """ETS C-test rule: show first floor(n/2), blank last ceil(n/2)（公式 20/20 一致）"""
    cut = len(w)//2
    return w[:cut], w[cut:]           # (shown, answer)

def mk(words_with_punct):
    """20語token を (w,p) で並べるだけ。奇数位置(1始まり)=空所が自動で決まる"""
    return [{'w': w, 'p': p, 'blank': (i % 2 == 0)} for i, (w, p) in enumerate(words_with_punct)]

def build_passage(intro, target, conclusion):
    parts = []
    for t in target:
        if t['blank']:
            s, a = split_word(t['w'])
            parts.append(s + '_'*len(a) + t['p'])
        else:
            parts.append(t['w'] + t['p'])
    ts = ' '.join(parts)
    return {'target': ts, 'full': f"{intro} {ts} {conclusion}"}
```

### HTML への実装（本リポジトリ固有）
本リポジトリの練習ページは自己完結 HTML で `D.target` に `{w,a,s,p}` を持つ。
- **s / a は必ず `split_word(w)` の結果を入れる**（手入力禁止・floor(n/2) 厳守）。
- `blank=false` の語は `{w, a:null, s:null, p}`。
- 練習ページ（set-1/2）と解答ページ（answers）の `target` は**完全に同一**にすること
  （不一致は過去のバグ源。生成後にプログラムで一致検証）。
- 入力欄バリデーション: 各 `.bx input` の input イベントで `value.replace(/[^A-Za-z]/g,'')` を必ずかける
  （`inputmode="latin"` だけだと IME 経由でひらがな・全角が入り不公平な不正解が出る）。
- レンダリング・CSS・Auto-advance・Review overlay・Auth guard は既存 set ファイル踏襲。
- 制限時間: 各セット 10 分（メインアプリ実装に合わせる）。

═══════════════════════════════════════════════════════════════════════
PART 3: MANDATORY VERIFICATION（生成後に必ず実行）
═══════════════════════════════════════════════════════════════════════
```python
import re
SPECIALIST = {"hieroglyph","aqueduct","algorithm","photosynthesis","chromosome",
 "metamorphosis","seismograph","chlorophyll","isotope","aperture","oscillation",
 "calibration","thermodynamic","cardiovascular","neurotransmitter","pathogen"}
BANDS = {"M1": dict(ans_avg=(2.3,3.3), ans_max=5),
         "M2H":dict(ans_avg=(2.5,3.7), ans_max=6)}
def _wc(t): return len(re.sub(r'<[^>]+>','',t).split())

def verify_ctw_v35(intro, target, conclusion, module="M1"):
    err=[]; warn=[]
    if len(target)!=20: err.append(f"target must be 20 tokens (got {len(target)})")
    for i,t in enumerate(target):
        odd=(i%2==0)
        if odd and not t['blank']: err.append(f"pos{i+1} ({t['w']}) must be BLANK")
        if (not odd) and t['blank']: err.append(f"pos{i+1} ({t['w']}) must be FULL")
    blanks=[t for t in target if t['blank']]
    if len(blanks)!=10: err.append(f"need 10 blanks (got {len(blanks)})")
    for t in blanks:
        if len(t['w'])<2: err.append(f"'{t['w']}' too short to blank (len<2)")
        if t['w'].lower() in SPECIALIST: err.append(f"'{t['w']}' specialist — don't blank")
    ans=[]; show=[]
    for t in blanks:
        s,a=split_word(t['w']); ans.append(len(a)); show.append(len(s)/len(t['w']))
    if blanks:
        aavg=sum(ans)/len(ans); amax=max(ans); savg=sum(show)/len(show)*100
        b=BANDS[module]
        if not (b['ans_avg'][0]<=aavg<=b['ans_avg'][1]):
            warn.append(f"{module} ans avg {aavg:.2f} outside {b['ans_avg']} → tune VOCAB, not deletion")
        if amax>b['ans_max']: warn.append(f"{module} ans max {amax} > {b['ans_max']} → word too long for module")
        print(f"[{module}] ans avg={aavg:.2f} max={amax} | show avg={savg:.1f}% | total={_wc(intro)+20+_wc(conclusion)}")
    total=_wc(intro)+20+_wc(conclusion)
    if not (70<=total<=100): err.append(f"total {total} not in 70-100")
    for w in warn: print("  ⚠️", w)
    if err:
        for e in err: print("  ❌",e)
        return False
    print("  ✅ v3.5 VERIFIED"); return True
```

### ROUND-TRIP（HTML を手編集した場合は必須）
生成した passage 文字列を再パースし、データ（floor(n/2)）と一致するか照合する。
アンダースコア増減・shown 綴り・句読点・FULL 語綴り・トークン欠落を検出。
（本リポジトリでは「練習 set の D.target」と「answers の SD[1].target」の**両方**を w 単位で照合し、
floor(n/2) との一致・穴埋め10問一致・exp 件数一致を機械検証する。）

### ⭐ 一意性（UNIQUENESS）の最終チェック（MANUAL・最重要）
コードは構造しか見ない。**各空所について「表示 s ＋ 残り文字数 ＋ 両隣の表示語・文脈」で、
当てはまる英単語が本当に1つだけか」を必ず人手で確認する**。
- 危険例: `co____`（6字）→ could / control / cooled 等が競合しうる。両隣・文の意味で1つに絞れるか確認。
- 絞れない場合は **語を差し替える**（floor(n/2) や show% はいじらない。語彙で解決）。
- 厳密交互により両隣は必ず表示語なので、通常は文脈で一意化できる。できなければその語は不適。

═══════════════════════════════════════════════════════════════════════
MANDATORY WORKFLOW
═══════════════════════════════════════════════════════════════════════
1. 学術トピックを選ぶ（既出回避／`docs/topic-history.md`）。
2. intro（完全文）／ 20語 target ／ conclusion（完全文）を作文。
   - **奇数位置の語が len≥2** になるよう作文（a / I を奇数位置に置かない）。
   - 機能語・短語も奇数位置に自然に混ぜる（公式の質感）。
3. `target = mk([(w,p),...])` で構築（s/a は触らない）。
4. `verify_ctw_v35()` を実行 → ✅（warn は語彙/語長で調整、削り方はいじらない）。
5. **一意性チェック**（各空所が文脈で1つに定まるか人手確認 → 不可なら語を差し替え）。
6. `build_passage()` の s/a（=floor(n/2)）を HTML の D.target / answers の SD へ反映。
7. 練習↔解答の target 一致・floor(n/2) 一致・exp 件数一致をプログラム検証。
8. `docs/topic-history.md` に追記。

**絶対禁止**:
- ❌ s/a を手入力（必ず split_word で導出）
- ❌ show% を下げて難しくする（floor(n/2) 固定）
- ❌ 日常・自己啓発トピック
- ❌ 1文字語を空所にする
- ❌ 空所を隣接させる（厳密交互を崩す）

═══════════════════════════════════════════════════════════════════════
出力フォーマット（レビュー原稿・任意）
═══════════════════════════════════════════════════════════════════════
配布/レビュー時は「問題＝空所入りパッセージ」と「解答＝Answer key / Blank table / 検証」を
`━ 問題 ━` / `━ 解答（配布時は削除）━` で完全分離する。検証統計（語数 / ans 平均・最大 /
show% / バンド判定）は必ず解答ブロックに集約。Notice / Question 11・12 は生成しない。

═══════════════════════════════════════════════════════════════════════
VERIFICATION CHECKLIST（v3.5.2）
═══════════════════════════════════════════════════════════════════════
- [ ] トピックが学術系（日常・自己啓発でない）
- [ ] 合計 70–100 語
- [ ] target ちょうど20語・**厳密交互**（奇数=空所／偶数=表示）
- [ ] 空所10個・全て len≥2
- [ ] 全空所が **floor(n/2)** 削除（split_word で導出＝自動保証）
- [ ] アンダースコア/ボックス数 = 解答長
- [ ] ans 平均/最大が選択 Module のバンド内（外れたら**語彙**調整）
- [ ] specialist 語を空所にしていない
- [ ] **各空所が文脈で一意**（MANUAL）
- [ ] 練習 set と answers の target が完全一致・floor(n/2) 一致（CODE）
- [ ] （手編集時）round-trip が PASS

END OF GUIDE (v3.5.2)
