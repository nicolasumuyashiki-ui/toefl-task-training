# 音源生成・編集における自然な間隔（沈黙時間）の標準

リスニング音源（Conversation / Academic Talk / Announcement / LCR / Listen & Repeat / Take an Interview）を新規生成または編集するときに従う、ポーズ長の規範。

## 研究的根拠

| 場面 | 値 | 出典 |
|---|---|---|
| 英語典型的な質問→回答（中央値） | 0–200 ms | Stivers et al. 2009 |
| 知覚閾値（沈黙だと気付き始める） | ~300 ms | Levinson & Torreira |
| 理解を助ける自然な間 | ~500 ms | 認知言語学 |
| 「考えてる」と感じられる範囲 | 700–1200 ms | コミュニケーション研究 |
| 不自然・気まずい境界 | **3 秒以上** | 複数研究 |

## TCK Workshop 標準仕様

すべての話者交代・節間ポーズは **350 ms 以上 1500 ms 以下** に収める。

| シーン | 目標範囲 | 用途 |
|---|---|---|
| **デフォルト**（話者交代） | **400–600 ms** | Conversation の通常ターン、Talk の文間 |
| 即答・相槌系 | **300–400 ms** | "Yeah," "Right," "Sure," |
| 熟考した回答 | **800–1200 ms** | "Hmm... let me think." の前後 |
| 気付き系（"Oh, I see"） | **300–400 ms**（短め） | 短いリアクション |
| 講義の話題転換 | **800–1200 ms** | "Now, moving on..." 前後 |
| 講師の強調前後（キーワード） | **600–1000 ms** | "...so the key point is...　X." |
| 1文内の小休止（コンマ・節間） | **200–400 ms** | TTS 自動でも近い値 |
| **絶対上限** | **1500 ms** | 明確な意図がある場合のみ可 |

## ElevenLabs（または他 TTS）への指示

スクリプト内に SSML `<break time="500ms"/>` を挿入：

```ssml
[WOMAN] Hi, I'm having trouble connecting to the campus Wi-Fi.
<break time="500ms"/>
[MAN] I see. Have you tried restarting your laptop?
<break time="500ms"/>
[WOMAN] Yeah, I did that.
<break time="900ms"/>  <!-- 熟考の間 -->
[MAN] Hmm... could be the certificate cache, then.
```

ターン交代の `<break>` を **必ず明示**。指定しないと TTS は ~200ms前後で繋ぐ傾向があり、食い気味/食い被りになる。

## 検証（生成後の必須チェック）

```bash
python3 audit_audio.py    # repo に常設するスクリプト
```
- **250 ms 未満のポーズ** が出たら NG → 短すぎ
- **1500 ms 超のポーズ** が出たら NG（意図ある場合は exception list へ）

正規化（既存音源を後から修正する場合）:
```bash
python3 normalize_audio.py   # 350ms 床、1500ms 天井で再エンコード
```

`audio_backup/` に元ファイルが退避される。

## 参考リンク

- [Stivers et al. (PNAS 2009)](https://www.pnas.org/doi/10.1073/pnas.0903616106)
- [Timing in Conversation (NIH/PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10077995/)
- [Pause length and cognitive state attribution (MDPI 2023)](https://www.mdpi.com/2226-471X/8/1/26)
