# JEV Voice Server

For You/JEV Voiceスタック用のNode.jsサーバー。WebSocketとHTTP APIを提供し、Androidアプリからのリモート操作を可能にします。

## 特徴

- 🔌 **WebSocket**: リアルタイム双方向通信
- 🌐 **HTTP API**: RESTful エンドポイント
- 🔒 **認証**: トークンベース認証
- 📊 **For You統合**: foryou-data.jsonからデータを読み込み
- 🔍 **検索機能**: For Youデータ内の全文検索
- 🖥️ **Chrome拡張連携**: デスクトップChromeの制御（将来実装予定）

## インストール

```bash
npm install
```

## 起動

```bash
npm start
```

開発モード（ファイル監視）:

```bash
npm run dev
```

## 環境変数

```bash
# サーバーポート（デフォルト: 8765）
PORT=8765

# ホスト（0.0.0.0でLAN接続を許可）
HOST=0.0.0.0

# 認証トークン（未設定の場合は自動生成）
AUTH_TOKEN=your-secret-token

# Typesafe APIキー（PCサーバー側のみ）
TYPESAFE_API_KEY=your-api-key
```

## 起動例

```bash
# 基本起動
npm start

# カスタムポートで起動
PORT=9000 npm start

# 固定トークンで起動
AUTH_TOKEN=my-secret-token npm start
```

起動時にコンソールに表示される情報を確認してください：

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  JEV Voice Server Started
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  HTTP:      http://0.0.0.0:8765
  WebSocket: ws://0.0.0.0:8765
  
  Auth Token: abc123xyz456...
  
  For Android app, use:
  - Server URL: ws://[YOUR_PC_IP]:8765
  - Token: abc123xyz456...
  
  Save this token for client configuration!
  
  Accounts loaded: 4
  
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## API エンドポイント

### HTTP API

#### ヘルスチェック
```
GET /health
```

レスポンス:
```json
{
  "status": "ok",
  "server": "jev-voice-server"
}
```

#### For Youデータ取得
```
GET /api/foryou
Authorization: Bearer <token>
```

レスポンス: `foryou-data.json` の内容

#### コマンド実行
```
POST /api/command
Authorization: Bearer <token>
Content-Type: application/json

{
  "command": "search",
  "text": "AI"
}
```

レスポンス:
```json
{
  "success": true,
  "query": "AI",
  "count": 10,
  "results": [...]
}
```

### WebSocket API

接続: `ws://[PC_IP]:8765?token=<auth_token>`

#### メッセージ形式

クライアント → サーバー:
```json
{
  "type": "command",
  "command": "search",
  "text": "検索クエリ",
  "timestamp": 1234567890
}
```

サーバー → クライアント:
```json
{
  "type": "command_result",
  "result": {
    "success": true,
    "message": "...",
    "data": {}
  }
}
```

## サポートされるコマンド

| コマンド | 説明 | パラメータ |
|---------|------|-----------|
| `search` | For Youデータ内を検索 | text: 検索クエリ |
| `refresh` | データ更新をリクエスト | - |
| `navigate` | ページ遷移 | text: 遷移先 |
| `speak` | 音声読み上げ | text: 読み上げテキスト |

## セキュリティ

- `HOST=0.0.0.0` の場合、認証トークンが必須です
- `TYPESAFE_API_KEY` はサーバー側のみに保存され、クライアントに送信されません
- 認証トークンは起動時に自動生成されるか、環境変数で指定できます

## ネットワーク設定

### PCのIPアドレスを確認

**Windows:**
```cmd
ipconfig
```

**macOS/Linux:**
```bash
ifconfig
# または
ip addr show
```

### ファイアウォール設定

ポート8765へのインバウンド接続を許可してください。

**Windows Firewall:**
```powershell
netsh advfirewall firewall add rule name="JEV Voice Server" dir=in action=allow protocol=TCP localport=8765
```

**macOS:**
システム環境設定 → セキュリティとプライバシー → ファイアウォール → オプション

## トラブルシューティング

### 接続できない

1. PCとスマートフォンが同じWi-Fiネットワークに接続されているか確認
2. PCのIPアドレスが正しいか確認
3. ファイアウォールがポート8765をブロックしていないか確認
4. 認証トークンが正しいか確認

### データが表示されない

`foryou-data.json` が正しい場所に配置されているか確認してください。
サーバーは `../../foryou-data.json` からデータを読み込みます。

## 開発

### ログレベル

コンソールにWebSocketとHTTPリクエストのログが表示されます。

### 拡張

`handleCommand` 関数を編集して新しいコマンドを追加できます。

```javascript
function handleCommand(command, text) {
  switch (command) {
    case 'custom':
      return { success: true, message: 'Custom command' };
    // ...
  }
}
```

## ライセンス

MIT
