#!/usr/bin/env node
// GitHub Pages のデプロイ直前に実行する（.github/workflows/pages.yml）。
// - sw.js と各HTMLの __BUILD_ID__ をビルドID（コミットSHA）に置き換える
//   → sw.js の中身が毎デプロイ変わり、ブラウザが新しいSWを検出して更新通知を出す
// - version.json（ビルドIDとデータ更新時刻）を書き出す → ページ復帰時の更新確認に使う
// リポジトリにはコミットしない（デプロイ用の作業コピーだけを書き換える）。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const PLACEHOLDER = '__BUILD_ID__';
export const STAMPED_FILES = ['sw.js', 'index.html', 'index.slim.html', 'foryou.html'];

export function dataStampOf(data) {
  let max = 0;
  for (const a of (data && Array.isArray(data.accounts) ? data.accounts : [])) {
    const t = Date.parse(a && a.updatedAt);
    if (Number.isFinite(t) && t > max) max = t;
  }
  return max ? new Date(max).toISOString() : null;
}

export function stamp(root, build, now = new Date()) {
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(build) || build === PLACEHOLDER) throw Error('Invalid build id: ' + build);
  for (const name of STAMPED_FILES) {
    const url = new URL(name, root);
    const text = readFileSync(url, 'utf8');
    if (!text.includes(PLACEHOLDER)) throw Error('Build placeholder missing in ' + name);
    writeFileSync(url, text.split(PLACEHOLDER).join(build));
  }
  const dataUrl = new URL('foryou-data.json', root);
  const dataStamp = existsSync(dataUrl) ? dataStampOf(JSON.parse(readFileSync(dataUrl, 'utf8'))) : null;
  const version = { build, builtAt: now.toISOString(), dataStamp };
  writeFileSync(new URL('version.json', root), JSON.stringify(version, null, 2) + '\n');
  return version;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const build = (process.argv[2] || process.env.GITHUB_SHA || '').slice(0, 12);
  if (!build) { console.error('usage: node scripts/stamp-pwa.mjs <build-id>'); process.exit(1); }
  const v = stamp(new URL('../', import.meta.url), build);
  console.log('Stamped PWA build ' + v.build + ' (data ' + v.dataStamp + ')');
}
