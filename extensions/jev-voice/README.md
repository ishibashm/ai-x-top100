# Jev Voice Browser Extension

Chrome拡張機能からユーザーの実際のChromeブラウザを音声とテキストで操作します。

## 特徴

- 🎤 **音声入力**: マイクから音声コマンドを入力
- ⌨️ **テキスト入力**: テキストでも指示を送信可能
- 🔒 **セキュア**: APIキーはサーバー側で管理、拡張機能には含まれません
- 📱 **サイドパネル**: Chromeのサイドパネルで常に表示
- 🎯 **DOM操作**: Webページの要素を自動でクリック、入力など
- 📸 **スナップショット**: タブの状態をキャプチャして送信

## インストール方法

1. Chrome拡張機能の開発者モードを有効にします
2. 「パッケージ化されていない拡張機能を読み込む」をクリック
3. このディレクトリ (`extensions/jev-voice/`) を選択

詳細な手順は [docs/chrome-extension.md](../../docs/chrome-extension.md) を参照してください。

## 使用方法

### 1. サーバーを起動

まず、Node.jsサーバーを起動します：

```bash
cd third_party/jev-voice-browser
npm install
npm start
```

サーバーは `http://localhost:3456` で起動します。

### 2. 拡張機能を使用

1. Chromeのツールバーで拡張機能アイコンをクリック
2. サイドパネルが開きます
3. 「接続済み」の表示を確認
4. 音声ボタンをクリックして音声入力、またはテキストエリアに入力

## アーキテクチャ

```
Chrome拡張機能
├── サイドパネル (UI、音声入力、テキスト入力)
├── サービスワーカー (バックグラウンド処理)
└── コンテンツスクリプト (DOM操作、スナップショット)
     ↓ WebSocket
Node.jsサーバー (localhost:3456)
├── TypeSafe APIキー管理
└── Jev音声認識ポリシー
     ↓ HTTPS
TypeSafe API
```

## ファイル構成

```
extensions/jev-voice/
├── manifest.json           # Manifest V3設定
├── sidepanel.html          # サイドパネルUI
├── sidepanel.css           # サイドパネルスタイル
├── sidepanel.js            # サイドパネルロジック
├── background.js           # サービスワーカー
├── content.js              # コンテンツスクリプト
└── icons/                  # アイコン画像（オプション）
```

## 開発

### デバッグ

- サイドパネル: サイドパネルを右クリック → 検証
- バックグラウンド: chrome://extensions → サービスワーカー → 検証
- コンテンツスクリプト: 通常のDevTools（F12）

### ログ

すべてのログはコンソールに出力されます。サイドパネルの「ログ」セクションでも確認できます。

## セキュリティ

- **APIキーは拡張機能に含まれません**
- すべての認識リクエストはlocalhostのサーバーを経由
- WebSocket接続は `chrome-extension://` originのみ許可
- コンテンツスクリプトは実行が必要な場合のみ注入

## 制限事項

- Chrome拡張機能のポリシーにより、一部のページ（chrome:// など）では動作しません
- マイクへのアクセス許可が必要です
- localhost:3456 のサーバーが起動している必要があります

## トラブルシューティング

### 「接続中...」から変わらない

- サーバーが起動しているか確認
- `http://localhost:3456/health` にアクセスして確認

### マイクが動作しない

- ブラウザのマイク権限を確認
- chrome://settings/content/microphone

### 拡張機能が読み込めない

- manifest.json のエラーを確認
- Chrome DevToolsのコンソールでエラーを確認

## ライセンス

MIT License
