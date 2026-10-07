/* PWA: Service Worker登録・更新通知・オフライン表示・インストール案内（index / foryou 共通）。 */
(function () {
  'use strict';
  var PLACEHOLDER = '__BUILD' + '_ID__';
  var doc = document.documentElement;
  var meta = document.querySelector('meta[name="app-build"]');
  var pageBuild = meta ? meta.content : PLACEHOLDER;
  var store = {
    get: function (k) { try { return localStorage.getItem('ai-x-pwa-' + k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem('ai-x-pwa-' + k, v); } catch (e) {} }
  };
  var en = function () { return /^en/.test(doc.lang || ''); };
  var T = {
    newPosts: ['新しい投稿があります', 'New posts available'],
    newVersion: ['新しいバージョンがあります', 'A new version is available'],
    update: ['更新', 'Update'],
    offline: ['オフライン表示中', 'Offline'],
    lastUpdated: ['最終更新: ', 'Last updated: '],
    install: ['ホーム画面に追加してアプリとして使えます', 'Install this board as an app'],
    installBtn: ['インストール', 'Install'],
    ios: ['iPhone / iPadでは 共有ボタン（□↑）→「ホーム画面に追加」でアプリとして使えます', 'On iPhone / iPad: tap Share (□↑) → "Add to Home Screen"'],
    close: ['閉じる', 'Close']
  };
  var t = function (k) { return T[k][en() ? 1 : 0]; };

  // ---- 表示中データの更新時刻 ----
  function pageData() {
    var stamp = null, label = '';
    try {
      var fy = document.getElementById('foryou-data');
      if (fy) {
        var max = 0;
        (JSON.parse(fy.textContent).accounts || []).forEach(function (a) { var x = Date.parse(a && a.updatedAt); if (x > max) max = x; });
        if (max) { stamp = max; label = new Intl.DateTimeFormat(en() ? 'en-GB' : 'ja-JP', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(max)); }
      }
      var bd = !fy && document.getElementById('board-data');
      if (bd) label = String(JSON.parse(bd.textContent).updated_label || '').replace(/\s*更新$/, '');
    } catch (e) {}
    return { stamp: stamp, label: label };
  }

  // ---- 見た目 ----
  var css = document.createElement('style');
  css.textContent = '#pwa-toasts{position:fixed;z-index:50;left:50%;transform:translateX(-50%);bottom:calc(10px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:6px;align-items:center;width:max-content;max-width:calc(100vw - 20px);pointer-events:none}' +
    '.pwa-toast{pointer-events:auto;display:flex;align-items:center;gap:8px;padding:6px 6px 6px 14px;border-radius:999px;border:1px solid var(--line,#2a3140);background:var(--card,#151a22);color:var(--text,#eef2fa);box-shadow:0 6px 24px #0006;font:12px/1.4 -apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif}' +
    '.pwa-toast.offline{background:#5a4210;border-color:#8a6a1e;color:#fff4d6;padding-right:14px}' +
    '#pwa-toasts .pwa-toast button{appearance:none;font:inherit;font-weight:800;min-height:36px;min-width:36px;padding:0 14px;border-radius:999px;border:0;cursor:pointer;background:var(--accent,#7dd3a8);color:var(--bg,#0b0d12)}' +
    '#pwa-toasts .pwa-toast button.ghost{background:transparent;color:var(--muted,#8b93a7);padding:0 10px;font-size:15px}' +
    '@media (prefers-reduced-motion:no-preference){.pwa-toast{animation:pwa-in .2s ease-out}@keyframes pwa-in{from{opacity:0;transform:translateY(8px)}}}';
  document.head.appendChild(css);
  var box = document.createElement('div');
  box.id = 'pwa-toasts';
  box.setAttribute('role', 'region');
  box.setAttribute('aria-label', 'お知らせ / Notifications');
  function mount() { if (!box.isConnected) document.body.appendChild(box); }

  var toasts = {};
  function toast(id, build) {
    mount();
    var node = toasts[id];
    if (!node) {
      node = document.createElement('div');
      node.className = 'pwa-toast ' + id;
      node.setAttribute('role', id === 'update' ? 'alert' : 'status');
      toasts[id] = node;
      box.appendChild(node);
    }
    node._build = build;
    node.replaceChildren();
    build(node);
    return node;
  }
  function hide(id) { if (toasts[id]) { toasts[id].remove(); delete toasts[id]; } }
  function rerender() { Object.keys(toasts).forEach(function (id) { var n = toasts[id]; n.replaceChildren(); n._build(n); }); }
  function span(text) { var s = document.createElement('span'); s.textContent = text; return s; }
  function button(text, onClick, cls, label) {
    var b = document.createElement('button'); b.type = 'button'; b.textContent = text; if (cls) b.className = cls; if (label) b.setAttribute('aria-label', label); b.onclick = onClick; return b;
  }
  // ページの言語切替（document.documentElement.lang）に追従して文言を切り替える。
  new MutationObserver(rerender).observe(doc, { attributes: true, attributeFilter: ['lang'] });

  // ---- 更新通知 ----
  var registration = null, reloading = false, updateKind = null;
  function applyUpdate() {
    var waiting = registration && registration.waiting;
    if (waiting) { waiting.postMessage({ type: 'SKIP_WAITING' }); setTimeout(function () { if (!reloading) location.reload(); }, 3000); }
    else location.reload();
  }
  function showUpdate(kind) {
    if (updateKind === 'newPosts' && kind === 'newVersion') kind = 'newPosts';
    updateKind = kind;
    toast('update', function (n) {
      n.append(span(t(updateKind)), button(t('update'), applyUpdate), button('×', function () { hide('update'); }, 'ghost', t('close')));
    });
  }

  // version.json はSWを通さず常にネットワークへ（届かなければオフライン扱い。navigator.onLine だけでは
  // 「Wi-Fiにはつながっているが通信できない」状態を検出できないため）。
  function checkVersion() {
    if (location.protocol === 'file:') return;
    if (!navigator.onLine) { syncOnline(); return; }
    fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) {
      networkDown = false; syncOnline();
      return r.ok && pageBuild !== PLACEHOLDER ? r.json() : null;
    }, function (e) { networkDown = true; syncOnline(); throw e; }).then(function (v) {
      if (!v || !v.build || v.build === pageBuild) return;
      var shown = pageData().stamp, latest = Date.parse(v.dataStamp);
      showUpdate(shown && latest > shown ? 'newPosts' : (document.getElementById('foryou-data') ? 'newVersion' : 'newPosts'));
    }).catch(function () {});
    if (registration) registration.update().catch(function () {});
  }

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (reloading) return; reloading = true; location.reload(); });
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js', { scope: './' }).then(function (reg) {
        registration = reg;
        if (reg.waiting && navigator.serviceWorker.controller) showUpdate('newVersion');
        reg.addEventListener('updatefound', function () {
          var w = reg.installing;
          if (!w) return;
          w.addEventListener('statechange', function () {
            if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate('newPosts');
          });
        });
      }).catch(function () {});
    });
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') checkVersion(); });
  window.addEventListener('focus', checkVersion);
  window.addEventListener('online', checkVersion);
  setInterval(function () { if (document.visibilityState === 'visible') checkVersion(); }, 30 * 60 * 1000);

  // ---- オフライン表示 ----
  var networkDown = false;
  function syncOnline() {
    if (navigator.onLine && !networkDown) { hide('offline'); return; }
    toast('offline', function (n) {
      var label = pageData().label;
      n.append(span(t('offline') + (label ? (en() ? ' (' : '（') + t('lastUpdated') + label + (en() ? ')' : '）') : '')));
    });
  }
  window.addEventListener('offline', syncOnline);

  // ---- インストール案内 ----
  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    if (store.get('install-dismissed')) return;
    toast('install', function (n) {
      n.append(span(t('install')), button(t('installBtn'), function () {
        hide('install');
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        deferredPrompt.userChoice.finally(function () { deferredPrompt = null; });
      }), button('×', function () { hide('install'); store.set('install-dismissed', '1'); }, 'ghost', t('close')));
    });
  });
  window.addEventListener('appinstalled', function () { hide('install'); store.set('install-dismissed', '1'); });
  var ua = navigator.userAgent || '';
  var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);

  function start() {
    mount();
    checkVersion();
    if (isIOS && isSafari && !standalone && !store.get('ios-hint-shown')) {
      store.set('ios-hint-shown', '1');
      toast('ios', function (n) { n.append(span(t('ios')), button('×', function () { hide('ios'); }, 'ghost', t('close'))); });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  window.__pwa = { checkVersion: checkVersion, showUpdate: showUpdate, build: pageBuild };
})();
