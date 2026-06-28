# 内部アカウント（モニター／管理者）一覧

このファイルは、**お客さん（有料受講者）ではない内部アカウント**（モニター・管理者・テスト用）の
userId を記録するもの。スコア集計・録音カバレッジ・幽霊行の監査などで「お客さん」の数字を見るときは、
ここに載っている userId を**除外**して判断する。

> 由来: オーナー（産屋敷）が 2026-06-28 に「これらの ID はモニターもしくは管理者の ID」と明示。

## 内部 userId

```
Nico
marisando
Nico1
andomarisa
mayu
yuna.kitamura
Momotaro
h.sakai
satoshi.okadome
hananotck
tmashimo
saosao
monitor-kadowaki
monitor-murakami
monitor-kusunoki
monitor-sato
burton
monitor-nanase
```

そのほか、明らかなテスト垢として観測されているもの: `testuser`, `user01`, `allZero` 等。

## 使い方

- GAS 監査スクリプト（`docs/gas-phantom-audit.js` ほか）では、この一覧を `INTERNAL_IDS` 集合として
  持たせ、「お客さんのみ」の集計時に除外する。
- 新しいモニター／管理者アカウントを追加したら、ここにも追記すること。
