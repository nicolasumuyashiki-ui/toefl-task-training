/**
 * docs/gas-pt-keys.js — Practice Test（模試）の正答キーを staff 認証付きで返す
 *
 * ■ なぜ必要か
 *   もともと正答キーは `admin/pt-keys.json` に置かれ、admin/index.html が
 *   `fetch('pt-keys.json')` で読んでいた。GitHub Pages は admin/ 配下も無認証で
 *   配信するため、URL を知っていれば誰でも Test 1-3 の Reading 正答 75 問と
 *   CTW 解答 90 語を丸ごとダウンロードできる状態だった（2026-07-25 の監査で検出）。
 *   本エンドポイントに移し、admin/pt-keys.json はリポジトリから削除した。
 *
 * ■ 重要な限界（必ず理解した上で運用すること）
 *   これは「集約された機械可読ファイルを消す」措置であって、正答そのものを
 *   秘匿するものではない。同じ正答は practice-test の各ページに平文で
 *   埋め込まれたままである。例:
 *     practice-test/reading-academic.html の saveM1Scores() に
 *       var correctAnswers = { … };   ← 正答が平文で並んでいる
 *     （実際の値はここには書かない。本ファイルも public リポジトリに入るため）
 *   模試はクライアント側で採点しているため、採点に必要な正答はブラウザに
 *   配信される＝ソースを見れば読める。さらに本リポジトリは public。
 *   正答を本当に秘匿するには採点をサーバ（GAS）側へ移す必要がある。
 *   本ファイルはその前段の措置と位置づけること。
 *
 * ■ デプロイ手順
 *   1. 下の PT_KEYS に実際のキー JSON を貼る（チャットで受け取った完全版）。
 *      ※ この docs/ 配下のファイルは public リポジトリに入るため、
 *         実キーを書き戻してコミットしないこと。GAS プロジェクト側にのみ持たせる。
 *   2. 本ファイルの内容を GAS プロジェクト末尾に貼り付け。
 *   3. doGet() の dispatch に1行追加（既存 admin* 群の近く）:
 *        if (action === 'adminGetPtKeys') return handleAdminGetPtKeys_(e, callback);
 *   4. デプロイ管理 → 既存デプロイを編集 → 新しいバージョン発行（API_URL は変えない）。
 *
 *   未デプロイでも Admin は壊れない: Api.ptKeys() が {} を返し、模試詳細は
 *   生徒の回答を ✓/✗ なしで表示する（公開ファイルへのフォールバックはしない）。
 *
 * ■ キーの保管場所を Script Property にしたい場合
 *   PT_KEYS を使わず、スクリプト プロパティ `PT_KEYS_JSON` に JSON 文字列を入れ、
 *   getPtKeys_() を下のコメントの実装に差し替える。
 *   （GAS のプロパティ値は 9KB 上限。現行キーは約 7KB で収まるが、
 *     Test 4 以降を足すと超える可能性があるため既定は埋め込みにしてある。）
 */

// ▼ 実際のキー JSON をここに貼る（public リポジトリにはコミットしないこと）
//   形は admin/pt-keys.json と同一:
//   { "1": { "reading": { "<page>.html": { "<qN>": "<A-D>", ... } },
//            "ctw":     { "<page>.html": { ... } },
//            "pages":   [ "<page>.html", ... ] },
//     "2": { ... }, "3": { ... } }
var PT_KEYS = {};

function getPtKeys_() {
  return PT_KEYS;
  // Script Property に置く場合はこちら:
  // try {
  //   var raw = PropertiesService.getScriptProperties().getProperty('PT_KEYS_JSON');
  //   return raw ? JSON.parse(raw) : {};
  // } catch (e) { return {}; }
}

// 模試の正答キー一式を返す（staff 認証必須）。
function handleAdminGetPtKeys_(e, callback) {
  if (!verifyStaff_(e.parameter.id, e.parameter.pass)) {
    return jsonpResponse_(callback, { success: false, error: 'auth_failed' });
  }
  var keys;
  try { keys = getPtKeys_() || {}; } catch (err) { keys = {}; }
  return jsonpResponse_(callback, { success: true, keys: keys });
}
