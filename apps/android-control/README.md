# For You リモートコントロール (Android PWA)

PC上のFor You/JEV Voiceサーバーをスマートフォンから操作するためのプログレッシブウェブアプリ（PWA）です。

## 特徴

- ✅ **PWA**: ホーム画面に追加してネイティブアプリのように使用可能
- 🔒 **セキュア**: 認証トークンによる接続保護
- 🌐 **LAN接続**: Wi-Fi経由でPC上のサーバーに接続
- 💬 **テキストコマンド**: 検索、ナビゲート、更新などの操作
- 📊 **リアルタイム状態表示**: WebSocketによる双方向通信
- 📱 **レスポンシブ**: スマートフォン・タブレット対応
- 🌙 **ダークモード対応**: システム設定に追従

## セキュリティ設計

- **TYPESAFE_API_KEY**: PCサーバー側のみに保存、APKには含まれません
- **認証トークン**: サーバー起動時に生成される共有トークンで認証
- **LAN限定**: インターネット経由のアクセスは想定していません

## セットアップ

### 1. サーバー起動 (PC)

```bash
cd apps/jev-voice-server
npm install
npm start
```

起動時にコンソールに表示される認証トークンを控えてください。

### 2. Androidアプリのセットアップ

#### 方法A: PWA（推奨）

1. スマートフォンのブラウザで `apps/android-control/public/index.html` を開く
2. ブラウザのメニューから「ホーム画面に追加」を選択
3. サーバーURLとトークンを入力して接続

#### 方法B: ローカルサーバー経由

```bash
cd apps/android-control/public
python -m http.server 8080
```

スマートフォンのブラウザで `http://[PC_IP]:8080` にアクセス

## 使い方

1. **サーバーURL**: `ws://[PCのIPアドレス]:8765`
2. **認証トークン**: PCのコンソールに表示されたトークン
3. **接続**: 設定を入力して「接続」ボタンをタップ
4. **コマンド送信**: クイックアクションまたはテキストコマンドで操作

### サポートされるコマンド

- **search**: For Youデータ内を検索
- **navigate**: ページ遷移
- **refresh**: データ更新
- **speak**: 音声読み上げ（将来実装予定）

## 開発

### ディレクトリ構造

```
apps/android-control/
├── public/
│   ├── index.html          # メインUI
│   ├── style.css           # スタイルシート
│   ├── app.js              # アプリケーションロジック
│   ├── manifest.json       # PWAマニフェスト
│   ├── service-worker.js   # サービスワーカー
│   └── icon-*.png          # アプリアイコン
└── README.md               # このファイル
```

### Capacitor統合（オプション）

より深いネイティブ統合が必要な場合、Capacitorを使用できます：

```bash
npm install @capacitor/core @capacitor/cli
npx cap init
npx cap add android
npx cap sync
npx cap open android
```

## 制限事項

- スマートフォンが直接デスクトップChromeを制御することはできません
- PC上のサーバーが仲介役として必要です
- 同一LAN内での使用を想定しています
- 音声認識機能は今後の実装予定です

## トラブルシューティング

詳細は [docs/android-app.md](../../docs/android-app.md) を参照してください。

## ライセンス

MIT
