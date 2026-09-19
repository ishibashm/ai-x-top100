# AI X Top 100 / AI情報 Top 100

iPad向けのスクロールなしボード。AI関連の注目ポスト Top 100 をリッチカードで表示します。

- 1画面50件
- ヘッダーで「1–50」「51–100」切替（左右スワイプ可）
- 「日本語／原文」トグル（localStorageに保存）

## 常時公開（GitHub Pages）

https://ishibashm.github.io/ai-x-top100/

（初回は Settings → Pages で Source を **GitHub Actions** にすると有効になります。このリポジトリ専用の URL なので、別リポジトリの日次デプロイには影響しません。）

## プレビュー（バックアップ）

https://htmlpreview.github.io/?https://github.com/ishibashm/ai-x-top100/blob/main/index.html

## リポジトリ

https://github.com/ishibashm/ai-x-top100

## おすすめ / For You ボード

`foryou.html` をブラウザで開くと動作します。JSONをHTML内に安全に埋め込んでいるため、データ取得の通信やサーバーは不要です。Top100のヘッダーの「おすすめ」とFor Youの「Top100」から往復できます。

- ヘッダーで Emerald Glen / @GazerStar79330、鳳翼炎輪祓闇大鎧城 / @N8jhSzyQoL35422、oshiyasu / @oshiyasu229196 を切り替えます。選択したアカウントのデータだけを表示します。
- 最後のアカウントと「日本語／原文」を専用のlocalStorageキーに保存します。保存が制限された環境でも画面は動作します。日本語訳がない投稿は原文を表示します。
- iPad縦横で5列×10行、画面内スクロールなし。ページ選択・左右ボタン・左右スワイプ・キーボードの← →で50件ずつ切り替えます。アカウントごとに最後のページを記憶し、再訪時に復元します。投稿が減った場合は最終ページ以内に補正します。
- 初期データは各アカウントに3件の架空サンプル＋49件の明示的プレースホルダ（計52件）です。2ページ目もすぐ試せます。作者・内容・数値は実際のX投稿やおすすめを表していません。
- 投稿が50件未満のページには空き枠を表示します。`posts: []` のアカウントでは専用の空状態を表示します。サンプルにはリンクを付けていません。実データのX投稿URLがあるカードは別タブで開きます。

### データ更新

最短手順：`foryou-data.json` の対象アカウントの `posts`・`sample`・`updatedAt` を更新 → `node scripts/build-foryou.mjs` → JSONとHTMLを一緒に反映。

### 使いやすさの改善

- アカウント選択を44px以上の高さとアクセント色で強調。ページ移動ボタンも44px四方以上にし、タップしやすくしました。
- 最終更新を端末の現地時刻で表示し、未取得は「未取得」と明記。実表示範囲（例：51–52 / 52件）も表示します。
- URLがあるカードはXを別タブで開きます。URLがないカードはタップで拡大表示。長文は本文内のページ切替で読めるためスクロール不要です。拡大表示の言語切替はボードの設定を変えません。閉じるボタンまたはEscで戻れます。
- 空状態から他のアカウントに直接切り替えられます。データ破損時には再読み込みボタンと更新手順リンクを表示します。
- Top100の `index.html` と `index.slim.html` には往復用リンクのみ追加し、既存の投稿データと表示処理は維持しています。

### データ形式

`foryou-data.json` の `accounts` 内で対象の `handle` を探し、その `posts` をおすすめの表示順に更新します。アカウントの `handle` と投稿作者の `handle` は別物です。自分の投稿だけに絞り込む処理はありません。

```json
{
  "name": "Emerald Glen",
  "handle": "GazerStar79330",
  "sample": false,
  "updatedAt": "2026-09-19T12:00:00Z",
  "posts": [
    {
      "id": "実際の投稿ID（文字列）",
      "author": "投稿作者名",
      "handle": "投稿作者のハンドル（@なし）",
      "text": "原文",
      "textJa": "任意の日本語訳",
      "avatar": "https://example.com/avatar.jpg",
      "media": "https://example.com/thumbnail.jpg",
      "metrics": { "views": 1200, "likes": 35 },
      "url": "https://x.com/投稿作者/status/実際の投稿ID",
      "createdAt": "2026-09-19T11:00:00Z"
    }
  ]
}
```

`id`・`author`・`handle`・`text` は必須です。`name` を `author` の代わりに使用でき、既存形式の `snippet`・`snippet_ja`・`views`・`likes` も表示できます。翻訳・画像・メトリクス・URL・日時は省略可能。メトリクスはviewsを優先し、なければlikesを表示します。実データへの差替え時に `sample: false` と取得日時を設定してください。

更新後、Node.jsで以下を実行し、JSONと生成されたHTMLを一緒に保存・コミットします。

```sh
node scripts/build-foryou.mjs
node scripts/build-foryou.mjs --check
```

生成処理はデータを検証し、`<` などをUnicodeエスケープしてscript要素への安全な埋め込みを行います。ブラウザ側でも本文をHTMLとして解釈しません。実取得・自動ログイン・スクレイピングは実装していません。

### 公開

既存 `.github/workflows/pages.yml` はリポジトリ全体を公開するため変更不要です。これらの追加ファイルをmainへ反映し既存デプロイが成功すると、[For Youページ](https://ishibashm.github.io/ai-x-top100/foryou.html) で利用できます。反映前は未公開です。[htmlpreview](https://htmlpreview.github.io/?https://github.com/ishibashm/ai-x-top100/blob/main/foryou.html) でも埋め込みデータで動作する構成です。
