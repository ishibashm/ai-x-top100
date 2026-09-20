# アイコン生成ガイド

PWAには192x192と512x512のPNGアイコンが必要です。

## 方法1: オンラインツールを使用（最も簡単）

1. `public/icon.svg` を開く
2. 以下のサイトでSVGをPNGに変換:
   - https://www.svgviewer.dev/
   - https://svgtopng.com/
   - https://cloudconvert.com/svg-to-png

3. 192x192と512x512のサイズで変換
4. `public/icon-192.png` と `public/icon-512.png` として保存

## 方法2: Inkscapeを使用

```bash
# 192x192
inkscape icon.svg --export-filename=icon-192.png --export-width=192 --export-height=192

# 512x512
inkscape icon.svg --export-filename=icon-512.png --export-width=512 --export-height=512
```

## 方法3: ImageMagickを使用

```bash
# 192x192
convert icon.svg -resize 192x192 icon-192.png

# 512x512
convert icon.svg -resize 512x512 icon-512.png
```

## 方法4: Node.jsライブラリを使用

```bash
npm install sharp
```

```javascript
const sharp = require('sharp');
const fs = require('fs');

const svg = fs.readFileSync('icon.svg');

// 192x192
sharp(svg)
  .resize(192, 192)
  .png()
  .toFile('icon-192.png');

// 512x512
sharp(svg)
  .resize(512, 512)
  .png()
  .toFile('icon-512.png');
```

## 自動生成スクリプト

```bash
cd apps/android-control
npm install sharp
node generate-icons.js
```

## デザインのカスタマイズ

`public/icon.svg` を編集して、独自のデザインに変更できます。

現在のアイコンは、Androidロボットをモチーフにしたシンプルなデザインです。

## 確認

アイコンが正しく生成されたら:

1. PWAマニフェストで読み込まれているか確認
2. ブラウザの開発者ツール → Application → Manifest
3. アイコンが表示されることを確認

## プレースホルダー

開発中は、以下のようなプレースホルダー画像を使用することもできます：

```html
<!-- data URIとして使用 -->
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='512' height='512'><rect width='512' height='512' fill='%231a73e8'/></svg>">
```
