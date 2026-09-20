# サードパーティ コンポーネント / Third-Party Components

このディレクトリには、外部プロジェクトが含まれています。

## jev-voice-browser

**リポジトリ:** https://github.com/moritzkremb/jev-voice-browser  
**ライセンス:** MIT  
**バージョン:** 最新のmainブランチ（2026年9月時点）

### 概要

jev-voice-browserは、音声でブラウザを制御するNode.jsアプリケーションです。PlaywrightでChromiumを操作し、TypeSafeのJevモデル（`jev-1.13.0`）を使用して音声コマンドを解釈します。

### 主な機能

- Web Speech APIを使用したリアルタイム音声認識
- PlaywrightによるヘッドレスChromiumの制御
- TypeSafeのJevモデルによる意図の分類
- 破壊的な操作の確認プロンプト
- ローカルホストでの制御UIの提供

### このプロジェクトでの使用方法

`jev-voice-browser`で収集したニュースやウェブコンテンツを、既存のforyou MCPボードフローに統合します。詳細は`docs/jev-voice-browser-integration.md`を参照してください。

### ライセンス表記

```
MIT License

Copyright (c) 2024-2025 Moritz Kremb

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### 更新方法

```bash
cd third_party/jev-voice-browser
git pull origin main
```

### アップストリームへの貢献

改善点や問題を見つけた場合は、アップストリームのリポジトリにissueやPRを送ってください。
