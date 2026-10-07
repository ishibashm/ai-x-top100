/* AI情報 Top 100 / For You — Service Worker
 * BUILD_ID は GitHub Pages のデプロイ時に scripts/stamp-pwa.mjs がコミットSHAへ置き換える。
 * sw.js の中身が変わるのでブラウザが新しいSWを検出し、ページ側で「新しい投稿があります」を出す。
 */
'use strict';
const BUILD_ID = '__BUILD_ID__';
const PREFIX = 'ai-x-top100-';
const SHELL_CACHE = PREFIX + 'shell-' + BUILD_ID;
const IMAGE_CACHE = PREFIX + 'images-v1';
const IMAGE_MAX_ENTRIES = 150;
const NETWORK_TIMEOUT_MS = 4000;

// スコープからの相対パス。GitHub Pages のサブパス（/ai-x-top100/）でもそのまま動く。
const PRECACHE = [
  'index.html', 'index.slim.html', 'foryou.html', 'pwa.js',
  'manifest.webmanifest', 'icon.svg',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-192.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
  'foryou-data.json', 'foryou-buzz.json', 'data-meta.json'
];
const scoped = path => new URL(path, self.registration.scope).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // 1件の失敗でインストール全体が失敗しないよう個別に取得する。HTTPキャッシュは迂回。
    await Promise.all(PRECACHE.map(async path => {
      try {
        const res = await fetch(new Request(scoped(path), { cache: 'reload' }));
        if (res.ok) await cache.put(scoped(path), res);
      } catch (e) { /* オフライン等。次回に任せる */ }
    }));
  })());
  // 自動では有効化しない（ページの「更新」ボタンで SKIP_WAITING を受けてから切り替える）。
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== SHELL_CACHE && k !== IMAGE_CACHE).map(k => caches.delete(k)));
    if (self.registration.navigationPreload) { try { await self.registration.navigationPreload.enable(); } catch (e) {} }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  const type = event.data && event.data.type;
  if (type === 'SKIP_WAITING') self.skipWaiting();
  else if (type === 'GET_BUILD' && event.ports && event.ports[0]) event.ports[0].postMessage({ build: BUILD_ID });
});

function timeout(ms) { return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)); }

// HTML・データJSON：ネットワーク優先（オンラインなら常に最新）、失敗時はキャッシュ。
async function networkFirst(event, cacheKey) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const network = (async () => (event.preloadResponse && await event.preloadResponse) || fetch(event.request, { cache: 'no-cache' }))();
    const res = await Promise.race([network, timeout(NETWORK_TIMEOUT_MS)]);
    if (res && res.ok) {
      event.waitUntil(cache.put(cacheKey, res.clone()));
      return res;
    }
    if (res) {
      const cached = await cache.match(cacheKey, { ignoreSearch: true });
      return cached || res;
    }
  } catch (e) { /* オフライン・タイムアウト */ }
  const cached = await cache.match(cacheKey, { ignoreSearch: true });
  if (cached) return cached;
  if (event.request.mode === 'navigate') {
    const fallback = await cache.match(scoped('index.html'));
    if (fallback) return fallback;
  }
  return new Response('オフラインのため表示できません / Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

async function trimCache(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

// 画像（サムネイル・アイコン）：キャッシュ優先、上限件数で古いものから削除。
async function cacheFirstImage(event) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(event.request.url);
  if (cached) return cached;
  let res;
  try {
    // CORS対応のホスト（pbs.twimg.com等）は通常のレスポンスで保存し、不透明レスポンスの容量水増しを避ける。
    res = await fetch(event.request.url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch (e) {
    try { res = await fetch(event.request); } catch (e2) { return Response.error(); }
  }
  if (res && (res.ok || res.type === 'opaque')) {
    event.waitUntil(cache.put(event.request.url, res.clone()).then(() => trimCache(cache, IMAGE_MAX_ENTRIES)));
  }
  return res;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameScope = req.url.startsWith(self.registration.scope);
  if (req.mode === 'navigate' && sameScope) {
    const key = url.pathname.endsWith('/') ? scoped('index.html') : url.origin + url.pathname;
    event.respondWith(networkFirst(event, key));
    return;
  }
  if (sameScope && url.pathname.endsWith('version.json')) return; // 更新確認は常にネットワーク
  if (sameScope && (/\.(json|webmanifest|js)$/.test(url.pathname) || /\.html$/.test(url.pathname))) {
    event.respondWith(networkFirst(event, url.origin + url.pathname));
    return;
  }
  if (req.destination === 'image' || /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(url.pathname)) {
    if (sameScope) { event.respondWith(caches.match(url.origin + url.pathname).then(r => r || fetch(req))); return; }
    event.respondWith(cacheFirstImage(event));
  }
});
