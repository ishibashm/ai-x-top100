# For You Jev digest 下書きパイプライン

`foryou-data.json` にある既存 For You データを読み込み、**日本語のブログ下書き**を Markdown と JSON で生成するための MVP です。

- 既定では **mock 分類**で動作します
- `TYPESAFE_API_KEY` がある場合だけ、JEV (`POST https://api.typesafe.ai/v1/systemone`) による分類を試します
- **自動公開はしません**
  - GitHub Pages
  - note
  - Zenn
  - Qiita
  - X

公開・投稿はすべて手動です。

## できること

`node scripts/foryou-jev-digest.mjs` は次を出力します。

- `drafts/foryou-digest-YYYYMMDD.md`
  - アカウント別テーマ
  - 注目投稿
  - 関連クラスタ
  - そのまま編集に使えるブログ本文ドラフト
- `drafts/foryou-digest-YYYYMMDD.json`
  - 分類結果と集計の sidecar

## 前提

- Node.js が入っていること
- 入力データとして `foryou-data.json` があること

追加依存はありません。

## まずは dry-run

API キーなしで、そのまま動きます。

```sh
node scripts/foryou-jev-digest.mjs --dry-run
```

既定では:

- 入力: `foryou-data.json`
- 出力先: `drafts/`
- 分類: `mock`

## 通常実行

```sh
node scripts/foryou-jev-digest.mjs
```

`TYPESAFE_API_KEY` が未設定なら mock 分類、設定済みなら JEV 分類を試します。

## JEV 分類を使う場合

```sh
export TYPESAFE_API_KEY="ts_..."
node scripts/foryou-jev-digest.mjs
```

メモ:

- 分類に失敗した投稿は自動で mock にフォールバックします
- API キーやレスポンス内容はリポジトリへ保存しません
- このスクリプトは分類用途のみで JEV を使い、本文要約はローカルで組み立てます

## よく使うオプション

```sh
node scripts/foryou-jev-digest.mjs --date 20260920
node scripts/foryou-jev-digest.mjs --limit 20 --dry-run
node scripts/foryou-jev-digest.mjs --output-dir tmp/drafts
node scripts/foryou-jev-digest.mjs --no-json
```

## 出力の見方

Markdown には以下の順でまとまります。

1. 生成メタ
2. タイトル案
3. アカウント別テーマ
4. トップ投稿
5. 関連クラスタ
6. ブログ本文ドラフト

「そのまま公開」ではなく、**編集用の下書き**として使う前提です。

## 運用上の注意

- 既存の For You ボード表示フローは変更していません
- `foryou.html` への自動反映もしません
- Pages / ブログ / SNS への publish ステップは別運用です
- サンプル出力はローカル生成物なので、必要なら差分を確認してからコミットしてください
