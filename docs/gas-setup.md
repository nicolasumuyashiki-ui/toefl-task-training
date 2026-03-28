# GAS バックエンド セットアップ手順

## 1. 新しい Google スプレッドシートを作成

1. Google Drive で「新規 > Google スプレッドシート」
2. 名前を「TOEFL タスク別トレーニング Database」に変更
3. シート1の名前を `USERS` に変更
4. 1行目にヘッダーを入力:
   ```
   A1: id | B1: password | C1: name | D1: email | E1: registered_at
   ```
5. シートを追加して `ANSWERS` と命名
6. ANSWERS の1行目にヘッダーを入力:
   ```
   A1: timestamp | B1: userId | C1: userName | D1: set | E1: answers | F1: score
   ```

## 2. GAS スクリプトを追加

1. スプレッドシートのメニューから「拡張機能 > Apps Script」を開く
2. エディタに以下のコードを貼り付け（既存のコードを全て置換）:

```javascript
// ========================================
// TOEFL タスク別トレーニング — GAS Backend
// ========================================

function doGet(e) {
  var action = e.parameter.action;
  var result;

  try {
    if (action === 'login') {
      result = handleLogin(e.parameter.id, e.parameter.pass);
    } else if (action === 'register') {
      result = handleRegister(e.parameter.id, e.parameter.pass, e.parameter.name, e.parameter.email);
    } else if (action === 'recover') {
      result = handleRecover(e.parameter.email);
    } else {
      result = { success: false, error: '不明なアクションです' };
    }
  } catch (err) {
    result = { success: false, error: err.message };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var result;

  try {
    var data = JSON.parse(e.postData.contents);

    if (data.action === 'saveAnswers') {
      result = handleSaveAnswers(data);
    } else {
      result = { success: false, error: '不明なアクションです' };
    }
  } catch (err) {
    result = { success: false, error: err.message };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== LOGIN =====
function handleLogin(id, pass) {
  if (!id || !pass) return { success: false, error: 'IDとパスワードを入力してください' };

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('USERS');
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === id && String(data[i][1]).trim() === pass) {
      return {
        success: true,
        userId: String(data[i][0]),
        userName: String(data[i][2])
      };
    }
  }

  return { success: false, error: 'IDまたはパスワードが正しくありません' };
}

// ===== REGISTER =====
function handleRegister(id, pass, name, email) {
  if (!id || !pass || !name) return { success: false, error: 'すべての項目を入力してください' };
  if (id.length < 3 || id.length > 20) return { success: false, error: 'IDは3〜20文字で入力してください' };
  if (pass.length < 4) return { success: false, error: 'パスワードは4文字以上で入力してください' };

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('USERS');
  var data = sheet.getDataRange().getValues();

  // Check for duplicate ID
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === id) {
      return { success: false, error: 'このIDは既に使用されています' };
    }
  }

  // Add new user
  var now = new Date().toISOString();
  sheet.appendRow([id, pass, name, email || '', now]);

  return {
    success: true,
    userId: id,
    userName: name
  };
}

// ===== RECOVER =====
function handleRecover(email) {
  if (!email) return { success: false, error: 'メールアドレスを入力してください' };

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('USERS');
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][3]).trim().toLowerCase() === email.toLowerCase()) {
      var userId = String(data[i][0]);
      var userPass = String(data[i][1]);
      var userName = String(data[i][2]);

      try {
        MailApp.sendEmail({
          to: email,
          subject: 'TOEFL タスク別トレーニング — ログイン情報',
          htmlBody:
            '<h3>ログイン情報</h3>' +
            '<p>お名前: ' + userName + '</p>' +
            '<p>ID: <strong>' + userId + '</strong></p>' +
            '<p>パスワード: <strong>' + userPass + '</strong></p>' +
            '<br><p>TCK Workshop</p>'
        });
      } catch (mailErr) {
        return { success: false, error: 'メール送信に失敗しました: ' + mailErr.message };
      }

      return { success: true, message: 'ログイン情報をメールに送信しました' };
    }
  }

  return { success: false, error: 'このメールアドレスは登録されていません' };
}

// ===== SAVE ANSWERS =====
function handleSaveAnswers(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ANSWERS');
  var now = new Date().toISOString();

  sheet.appendRow([
    now,
    data.userId || '',
    data.userName || '',
    data.set || '',
    JSON.stringify(data.answers || {}),
    data.score || 0
  ]);

  return { success: true };
}
```

3. Ctrl+S で保存

## 3. ウェブアプリとしてデプロイ

1. Apps Script エディタで「デプロイ > 新しいデプロイ」
2. 種類: 「ウェブアプリ」を選択
3. 設定:
   - 説明: 「TOEFL タスク別トレーニング API」
   - 次のユーザーとして実行: 「自分」
   - アクセスできるユーザー: 「全員」
4. 「デプロイ」をクリック
5. 初回は Google アカウントの承認が必要（「詳細」→「安全でないページに移動」→「許可」）
6. **表示されたウェブアプリ URL をコピー**

## 4. api.js の URL を更新

`js/api.js` の1行目の URL を新しいものに差し替え:
```javascript
var API_URL = 'https://script.google.com/macros/s/YOUR_NEW_DEPLOYMENT_ID/exec';
```

## 5. 動作確認

1. サイトにアクセス
2. 新規アカウント作成でログイン
3. スプレッドシートの USERS シートに新しい行が追加されていることを確認
