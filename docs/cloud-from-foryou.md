# For Youボードから@cloud8wq用ドラフト生成

このドキュメントでは、For Youボードのシグナルから@cloud8wq用の長文日本語ドラフトを生成するパイプラインの使い方を説明します。

## 概要

`scripts/draft-cloud-from-foryou.mjs` は、For Youボード（`foryou-data.json`）からトピック関連の投稿を抽出し、@cloud8wqの長文投稿用のドラフトを生成します。

**重要**: このスクリプトはドラフトを生成するだけで、Xへの投稿は**行いません**。投稿前に必ず人間が内容を確認・承認する必要があります。

## 使い方

### 基本的な実行

```bash
node scripts/draft-cloud-from-foryou.mjs
```

デフォルトでは、"jev|typesafe|system one" に関連する投稿を抽出します。

### オプション

```bash
node scripts/draft-cloud-from-foryou.mjs [options]
```

#### 利用可能なオプション

- `--data PATH` : foryou-data.jsonのパス（デフォルト: `foryou-data.json`）
- `--topic PATTERN` : フィルタリング用トピックキーワード（正規表現対応）
- `--keyword PATTERN` : `--topic`と同じ
- `--account HANDLE` : 特定のボードアカウントだけを対象にする
- `--dry-run` : ファイルを書き込まずに概要だけ表示
- `-h, --help` : ヘルプを表示

### 実行例

#### デフォルトトピックで実行

```bash
node scripts/draft-cloud-from-foryou.mjs
```

#### カスタムトピックで実行

```bash
node scripts/draft-cloud-from-foryou.mjs --topic "grok|gemini|claude"
```

#### 特定アカウントから抽出

```bash
node scripts/draft-cloud-from-foryou.mjs --account GazerStar79330
```

#### Dry run（書き込みなし）

```bash
node scripts/draft-cloud-from-foryou.mjs --topic "ai agent" --dry-run
```

## 出力ファイル

スクリプトは`drafts/`ディレクトリに2つのファイルを生成します：

### 1. `drafts/cloud-from-foryou-<日付>-signals.json`

マッチした投稿のメタデータを含むJSONファイル：

```json
{
  "generatedAt": "2026-09-23T11:00:00.000Z",
  "topic": "jev|typesafe|system one",
  "account": null,
  "totalMatches": 42,
  "signals": [
    {
      "id": "2100845574778237040",
      "author": "mana｜株式会社MakeAI CEO",
      "handle": "MakeAI_CEO",
      "text": "いやいやいや。Jevの活用事例まとめるの早すぎです！...",
      "url": "https://x.com/MakeAI_CEO/status/2100845574778237040",
      "boardAccount": "GazerStar79330",
      "boardAccountName": "Emerald Glen",
      "boardUpdatedAt": "2026-09-19T22:02:12.926122Z",
      "createdAt": "2026-09-18T07:13:11.000Z",
      "views": 342339,
      "likes": 1481
    }
  ]
}
```

### 2. `drafts/cloud-from-foryou-<日付>.md`

@cloud8wqの長文投稿構造に基づいたマークダウンドラフト：

```markdown
# 【海外AI動向】jev|typesafe|system one 関連の注目シグナル

生成日: 2026-09-23

## 見出し
<!-- TODO: トピックから魅力的な見出しを作成 -->

## 背景
<!-- For Youボードから抽出。以下は主要なシグナル -->
- [@handle](url): 投稿の抜粋...

## 要点
<!-- TODO: 上記シグナルから主要ポイントを3-5個抽出 -->

## なぜ重要か
<!-- TODO: ビジネス・技術的な意義を説明 -->

## 注意点
- 本ドラフトはFor Youボードから自動抽出されたシグナルです
- **自動投稿は禁止。必ず人間が確認してから投稿すること**

## 元リンク
- https://x.com/...
```

## ドラフト構造

生成されるドラフトは、@cloud8wqの投稿フォーマットに従っています：

1. **見出し**: トピックを表す魅力的なタイトル（要手動編集）
2. **背景**: For Youボードから抽出した主要シグナル（最大8件）
3. **要点**: 主要ポイントのまとめ（要手動編集）
4. **なぜ重要か**: ビジネス・技術的意義（要手動編集）
5. **注意点**: ベンダー主張や古い日付、必須の人間確認の注意書き
6. **元リンク**: 一次ソースへのリンク集（最大8件）

目安文字数: 800-2500文字

## ワークフロー

1. **シグナル抽出**: スクリプトを実行してFor Youボードから関連投稿を抽出
2. **一次ソース確認**: 生成されたリンクから実際の投稿内容を確認
3. **ドラフト編集**: マークダウンファイルを編集して完全な記事を作成
4. **人間による承認**: 内容を確認し、必要に応じて修正
5. **手動投稿**: 承認後、手動でXに投稿

## 朝のcloud運用への組み込み

このパイプラインは将来、朝のcloudルーチンに組み込むことができます：

1. 前日のFor Youボード更新を確認
2. 注目トピックでドラフト生成
3. 生成されたドラフトを確認・編集
4. 承認後に手動で投稿

**注意**: 現時点では自動投稿機能はなく、今後も追加される予定はありません。すべての投稿は人間による明示的な承認が必要です。

## 注意事項

### セキュリティ

- このスクリプトはAPIキーや認証情報を必要としません
- Xのスクレイピングは行いません
- ローカルデータ（foryou-data.json）のみを使用します

### データソース

- For Youボードのデータは人間が手動で更新・キュレーションしたものです
- ボードの更新日時は古い可能性があります
- 投稿内容は元の投稿作者の見解であり、検証が必要です

### 投稿前の確認事項

- [ ] 一次ソース（元のX投稿）を確認済み
- [ ] ベンダーの過剰な主張がないか確認
- [ ] 情報の正確性を複数ソースで検証
- [ ] 文字数が800-2500文字の範囲内
- [ ] 構造（見出し、背景、要点、なぜ重要か、注意点、元リンク）が完成
- [ ] 必ず人間が最終確認して承認

## トラブルシューティング

### マッチする投稿が見つからない

トピックパターンを調整してみてください：

```bash
# より広範なパターン
node scripts/draft-cloud-from-foryou.mjs --topic "ai|llm|model"

# 複数キーワード
node scripts/draft-cloud-from-foryou.mjs --topic "cursor|codex|claude"
```

### 出力ファイルが見つからない

`--dry-run`オプションを外して実行してください。また、`drafts/`ディレクトリが存在することを確認してください。

## 将来の拡張

現在はスクリプトのみですが、将来的には以下の拡張が考えられます：

- MCPツール化（オプション）: For Youサーバーに`draft_cloud_from_foryou`ツールを追加
- 複数トピックの一括処理
- メトリクス（views/likes）によるシグナルの優先順位付け
- 過去のドラフトとの重複チェック

ただし、**自動投稿機能は追加しません**。

## 参考

- For Youボード: `foryou.html`
- データソース: `foryou-data.json`
- ビルドスクリプト: `scripts/build-foryou.mjs`
- @cloud8wq投稿例: 長文・海外AI情報・日本語サマリー形式
