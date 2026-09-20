# Jev Voice Browser Server

TypeSafe APIキーを安全に管理し、Chrome拡張機能と通信するNode.jsサーバーです。

## セットアップ

```bash
cd third_party/jev-voice-browser
npm install
```

## 環境変数

`.env`ファイルを作成して以下の環境変数を設定してください：

```env
TYPESAFE_API_KEY=your_api_key_here
PORT=3456
```

## 起動

```bash
npm start
```

開発時（ファイル監視付き）：

```bash
npm run dev
```

## エンドポイント

### HTTP API

- `GET /health` - ヘルスチェック
- `POST /api/jev/recognize` - 音声認識（TypeSafe APIへのプロキシ）

### WebSocket

`ws://localhost:3456` でWebSocket接続を受け付けます。

メッセージ形式：

```json
{
  "type": "recognize",
  "audio": "base64_encoded_audio",
  "policy": "jev_policy_config"
}
```

レスポンス：

```json
{
  "type": "recognition_result",
  "result": {
    "transcript": "認識されたテキスト",
    "confidence": 0.95,
    "intent": "search"
  }
}
```

## アーキテクチャ

```
Chrome拡張機能 (extensions/jev-voice/)
    ↓ WebSocket/HTTP
Jev Voice Browser Server (このディレクトリ)
    ↓ HTTPS
TypeSafe API (APIキーはサーバー側で管理)
```

拡張機能にはAPIキーを含めず、すべての認識リクエストはこのサーバーを経由します。

## フォールバック

Playwrightのheadedブラウザをフォールバックとして使用できます。
`server.js`の最後のコメントを外すことで有効化されます。

通常は拡張機能が実際のChromeで動作し、Playwrightは開発やテスト時の補助として機能します。
