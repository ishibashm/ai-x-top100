# For You 定期更新

毎日07:30 / 19:30 JST頃にボックス側のジョブで実行する1回分の手順です。取得にはXへのログインが必要なため、GitHub Actionsでは取得しません。ログイン済みの4アカウント（GazerStar79330 / N8jhSzyQoL35422 / oshiyasu229196 / cloud8wq）それぞれのFor Youタブから、表示順に投稿を取得します。

## 取得JSON

アカウントごとに次の形式で保存します。複数まとめる場合は `{ "accounts": [下記オブジェクト, ...] }` も使えます。取得ファイルは公開リポジトリ外の専用ディレクトリに置きます。

```json
{
  "account": "cloud8wq",
  "fetchedAt": "2026-10-03T07:31:00+09:00",
  "posts": [
    {
      "id": "2104042342181486846",
      "author": "投稿者名",
      "handle": "example",
      "text": "An update about AI",
      "views": 12000,
      "likes": 35,
      "reposts": 4,
      "replies": 2,
      "createdAt": "2026-10-03T06:00:00+09:00",
      "lang": "en"
    }
  ]
}
```

`account` は既存アカウントのみ。同じアカウントの複数指定はエラーです。`account` / `handle` の先頭の `@` は除去します。投稿の必須項目は数字文字列の `id`、`author`（`name` も可）、`handle`、文字列の `text`（メディアのみなら空文字可）。`url` は省略するとXの投稿URLを生成します。任意の `media` / `avatar` / `url` はHTTP(S) URL、`createdAt` と必須の `fetchedAt` はタイムゾーン付きISO8601日時です。任意のメトリクスは0以上の有限数で、`"1.2万"` / `"12K"` などの文字列は不可。`lang` / 空でない `textJa` も任意です。任意項目の `null` は未指定として扱います。

## 反映手順

1. 最新mainから `refresh/YYYYMMDD-HHMM`（JST、例: `refresh/20261003-0730`）ブランチを作成します。
2. 以下をリポジトリ直下で順に実行します。`/path/to/fetch` は取得JSONだけが入ったディレクトリに置き換えます。ファイルの複数指定も可能です。

```sh
node scripts/import-foryou.mjs /path/to/fetch --dry-run
node scripts/import-foryou.mjs /path/to/fetch
node scripts/foryou-translations.mjs list --out /path/to/pending.json
# pending.jsonを参照し、別ファイルに { "投稿ID": "日本語訳" } を作成
node scripts/foryou-translations.mjs apply /path/to/translations.json
node scripts/predict-buzz.mjs --prune
node scripts/build-foryou.mjs
node --test tests/
node scripts/build-foryou.mjs --check
```

取り込みは取得順で対象アカウントの投稿を置換し、既定100件（50件×2ページ）に制限します。`--max N` で変更できます。重複IDは最初を採用して警告し、0件はエラー（意図的に空にする場合のみ `--allow-empty`）。未取得アカウントは変更しません。同一ID・同一本文で取得側に訳がない場合のみ既存の訳と言語を引き継ぎます。本文変更時は古い訳を破棄します。

翻訳候補は未翻訳かつ空でなく、ひらがな・カタカナのない本文です。漢字だけの日本語も候補になるため原文を確認してください。`list --account HANDLE` で絞り込み、`--all` で空本文を含む未翻訳全件を出力できます。同一IDは最初の対象アカウントが代表です。`apply` は同一IDの全アカウントに適用し、未知IDは警告、空の訳はエラーです。自動翻訳の通信は行いません。`apply --dry-run` で保存せず確認できます。両スクリプトとも `--data PATH` で別のデータファイルを扱えます。

3. 差分を確認し、更新した `foryou-data.json` / `foryou-buzz.json` / `foryou.html` をコミット・pushしてPRを作成します。
4. GitHubのCheckが通ったらsquash-mergeします（オーナー承認済みの自動マージ運用）。取得・翻訳・検証・Checkなどが失敗した場合はPRを未マージのまま残し、原因と失敗した手順を記録して修正します。

## ボックス側の一括実行

ボックスでは `/workspace/foryou-refresh/run-after-fetch.sh FETCH_DIR [TRANSLATIONS_JSON]` が手順2〜4（main更新・ブランチ作成・取り込み・訳の適用・予測・ビルド・テスト・PR・Check待ち・squash-merge）をまとめて実行します。失敗時は非0で終了し、PRは未マージのまま残ります。
