#!/usr/bin/env bash
# run-voice-browser.sh - jev-voice-browserを起動するラッパースクリプト

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
JEV_DIR="$PROJECT_ROOT/third_party/jev-voice-browser"

# jev-voice-browserディレクトリの存在確認
if [ ! -d "$JEV_DIR" ]; then
  echo "エラー: jev-voice-browserが見つかりません: $JEV_DIR"
  echo "次のコマンドでクローンしてください:"
  echo "  git clone https://github.com/moritzkremb/jev-voice-browser.git third_party/jev-voice-browser"
  exit 1
fi

# .envファイルの確認
if [ ! -f "$PROJECT_ROOT/.env" ] && [ ! -f "$JEV_DIR/.env" ]; then
  echo "警告: .envファイルが見つかりません"
  echo "次の手順でセットアップしてください:"
  echo "  1. .env.exampleをコピー: cp .env.example .env"
  echo "  2. TYPESAFE_API_KEYを設定"
  echo "  3. https://console.typesafe.ai/keys からAPIキーを取得"
  echo ""
fi

# プロジェクトルートの.envがあれば、それを使用
if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a
  source "$PROJECT_ROOT/.env"
  set +a
  echo "プロジェクトルートの.envを読み込みました"
fi

# node_modulesの確認
if [ ! -d "$JEV_DIR/node_modules" ]; then
  echo "依存関係をインストールしています..."
  (cd "$JEV_DIR" && npm install)
fi

# Chromiumの確認
if ! command -v npx &> /dev/null; then
  echo "エラー: npxが見つかりません。Node.jsをインストールしてください。"
  exit 1
fi

# Playwrightのブラウザ確認（簡易チェック）
PLAYWRIGHT_BROWSERS="$HOME/.cache/ms-playwright"
if [ ! -d "$PLAYWRIGHT_BROWSERS" ] || [ -z "$(ls -A "$PLAYWRIGHT_BROWSERS" 2>/dev/null)" ]; then
  echo "Chromiumをインストールしています..."
  (cd "$JEV_DIR" && npx playwright install chromium)
fi

echo "=================================="
echo "jev-voice-browser を起動します"
echo "=================================="
echo ""
echo "制御UI: http://localhost:8787"
echo ""
echo "使い方:"
echo "  1. ブラウザで http://localhost:8787 を開く"
echo "  2. 'Start mic' をクリック"
echo "  3. マイクを有効化"
echo "  4. 音声コマンドを話す"
echo ""
echo "例:"
echo "  - \"go to wikipedia\""
echo "  - \"search for AI news\""
echo "  - \"click the first result\""
echo "  - \"scroll down\""
echo ""
echo "終了: Ctrl+C"
echo ""

# jev-voice-browserのrun.shを実行
cd "$JEV_DIR"
exec ./run.sh "$@"
