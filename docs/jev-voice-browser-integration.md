# jev-voice-browser 統合ガイド

このドキュメントでは、jev-voice-browserをAI X Top 100 / For Youプロジェクトに統合する方法を説明します。

## 概要

jev-voice-browserは、音声コマンドで実際のブラウザ（Chromium via Playwright）を制御するシステムです。TypeSafeのJevモデルを使用して音声を意図に変換し、ブラウザを操作します。

このプロジェクトでは、jev-voice-browserを使用して収集したニュースやウェブコンテンツを、既存のFor You MCPボードに統合します。

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI X Top 100 / For You                        │
│                                                                   │
│  ┌──────────────────┐         ┌───────────────────────────┐    │
│  │  foryou.html     │         │   foryou-data.json        │    │
│  │  (表示層)        │◀────────│   (データレイヤー)       │    │
│  └──────────────────┘         └───────────────────────────┘    │
│                                           ▲                       │
│                                           │                       │
│                                           │ データ供給            │
│                                           │                       │
└───────────────────────────────────────────┼───────────────────────┘
                                            │
                                            │
┌───────────────────────────────────────────┼───────────────────────┐
│                  jev-voice-browser        │                       │
│                                           │                       │
│  ┌──────────────┐    ┌──────────────┐   │   ┌────────────┐     │
│  │  音声入力    │───▶│  Jev モデル  │───┴──▶│ ブラウザ   │     │
│  │ (Web Speech) │    │  (TypeSafe)  │       │ (Playwright)│     │
│  └──────────────┘    └──────────────┘       └────────────┘     │
│                                                     │             │
│                                                     ▼             │
│                                           ┌────────────────┐     │
│                                           │ コンテンツ収集 │     │
│                                           └────────────────┘     │
└───────────────────────────────────────────────────────────────────┘
```

## セットアップ手順

### 1. TypeSafe APIキーの取得

1. https://console.typesafe.ai/keys にアクセス
2. アカウントを作成またはログイン
3. 新しいAPIキーを生成
4. キーを安全な場所にコピー

### 2. 環境変数の設定

プロジェクトルートに`.env`ファイルを作成します（`.env.example`を参考にしてください）：

```bash
cp .env.example .env
```

`.env`ファイルに以下を追加：

```
TYPESAFE_API_KEY=your_api_key_here
```

**重要:** `.env`ファイルは`.gitignore`に含まれており、コミットされません。

### 3. 依存関係のインストール

```bash
cd third_party/jev-voice-browser
npm install
npx playwright install chromium
```

### 4. voice-browserの起動

プロジェクトルートから：

```bash
./scripts/run-voice-browser.sh
```

または、third_party/jev-voice-browser内で直接：

```bash
cd third_party/jev-voice-browser
./run.sh
```

デフォルトで`http://localhost:8787`で起動します。

### 5. 制御UIへのアクセス

通常のChrome/Edgeブラウザで`http://localhost:8787`を開き、「Start mic」ボタンをクリックしてマイクを有効にします。

## 音声コマンドの例

| コマンド | 動作 |
|---------|------|
| "go to wikipedia" | Wikipediaに移動 |
| "search for AI news" | ページ内の検索ボックスまたはDuckDuckGoで検索 |
| "click the first result" | 最初の結果をクリック |
| "scroll down" | スクロールダウン |
| "go back" | ブラウザの戻るボタン |

## For Youボードへのデータ統合

### データフロー

1. **音声コマンド:** ユーザーがjev-voice-browserで「search for AI news」などと話す
2. **ブラウザ操作:** Playwrightがブラウザを操作して情報を収集
3. **コンテンツ抽出:** ページから記事のタイトル、URL、サマリーを取得
4. **データ変換:** `scripts/voice-to-foryou-bridge.js`が、収集したデータをFor You形式に変換
5. **ボード更新:** `foryou-data.json`に新しいポストを追加
6. **ビルド:** `node scripts/build-foryou.mjs`を実行してHTMLを再生成

### 手動統合の例

収集したコンテンツを手動で`foryou-data.json`に追加する場合：

```json
{
  "id": "voice_collected_001",
  "author": "AI News Today",
  "handle": "ainewstoday",
  "text": "Breaking: New AI model achieves state-of-the-art results",
  "textJa": "速報：新しいAIモデルが最先端の結果を達成",
  "url": "https://example.com/ai-news-article",
  "createdAt": "2026-09-20T04:00:00Z"
}
```

その後：

```bash
node scripts/build-foryou.mjs
```

## voice-inputとの関係

このプロジェクトには2つの音声入力パスがあります：

1. **jev-voice-browser（このドキュメント）:**
   - 実際のブラウザ（Playwright）を制御
   - Jevモデルで音声コマンドを解釈
   - ウェブページからコンテンツを収集
   - より高度で複雑な操作が可能

2. **従来のvoice-input（存在する場合）:**
   - より単純な音声入力メカニズム
   - 直接的なデータ入力に使用

jev-voice-browserは、より複雑なウェブナビゲーションとコンテンツ収集のための拡張として機能します。

## トラブルシューティング

### APIキーエラー

```
Error: TYPESAFE_API_KEY is not set
```

→ `.env`ファイルにAPIキーが正しく設定されているか確認してください。

### マイクが動作しない

- Chrome/Edgeを使用していることを確認（Firefox/Safariは非対応）
- ブラウザのマイク権限を確認
- HTTPSまたはlocalhostでアクセスしていることを確認

### Playwrightエラー

```
Error: Executable doesn't exist at ...
```

→ Chromiumをインストール：

```bash
cd third_party/jev-voice-browser
npx playwright install chromium
```

## セキュリティ考慮事項

- **APIキーの保護:** `.env`ファイルは絶対にコミットしないでください
- **ローカルホスト制限:** デフォルトで`127.0.0.1`でのみリッスン
- **LAN使用:** `--host 0.0.0.0`は信頼できるネットワークでのみ使用
- **ブラウザプロファイル:** `.browser-profile/`は永続的なプロファイルを使用。重要なアカウントでのログインは避けてください

## コスト

- 1リクエストあたり約$0.0002
- 通常のセッション（30分）で約$0.01-0.05

## 参考リンク

- [jev-voice-browser GitHub](https://github.com/moritzkremb/jev-voice-browser)
- [TypeSafe Console](https://console.typesafe.ai/)
- [Playwright Documentation](https://playwright.dev/)
