import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import vm from 'node:vm';
import { stamp, dataStampOf, PLACEHOLDER, STAMPED_FILES } from '../scripts/stamp-pwa.mjs';
import { embedData } from '../scripts/build-foryou.mjs';

const root = new URL('../', import.meta.url);
const read = name => readFileSync(new URL(name, root), 'utf8');
const HTML = ['index.html', 'index.slim.html', 'foryou.html'];

function precacheList() {
  const m = read('sw.js').match(/const PRECACHE = (\[[\s\S]*?\]);/);
  assert.ok(m, 'PRECACHE list');
  return vm.runInNewContext(m[1]);
}
function pngSize(name) {
  const b = readFileSync(new URL(name, root));
  assert.equal(b.toString('ascii', 1, 4), 'PNG', name + ' is PNG');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

test('repository copies stay unstamped (stamping happens only at deploy)', () => {
  for (const name of STAMPED_FILES) assert.ok(read(name).includes(PLACEHOLDER), name);
});

test('every precached file exists', () => {
  const list = precacheList();
  assert.ok(list.length > 5);
  for (const path of list) assert.ok(existsSync(new URL(path, root)), path);
  for (const name of HTML) assert.ok(list.includes(name), name + ' precached');
  assert.ok(list.includes('foryou-data.json') && list.includes('pwa.js'));
});

test('manifest icons exist with the declared sizes, including maskable', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './index.html');
  assert.equal(manifest.scope, './');
  for (const icon of manifest.icons) {
    assert.ok(existsSync(new URL(icon.src, root)), icon.src);
    if (icon.type === 'image/png') assert.deepEqual(pngSize(icon.src), icon.sizes.split('x').map(Number), icon.src);
  }
  const sizes = p => manifest.icons.filter(i => i.purpose === p && i.type === 'image/png').map(i => i.sizes);
  assert.ok(sizes('any').includes('192x192') && sizes('any').includes('512x512'));
  assert.ok(sizes('maskable').includes('512x512'));
  assert.deepEqual(pngSize('icons/apple-touch-icon.png'), [180, 180]);
});

test('pages carry PWA markup: manifest, SW script, build stamp, iOS tags, light/dark theme-color', () => {
  for (const name of HTML) {
    const html = read(name);
    for (const needle of ['rel="manifest"', '<script src="pwa.js" defer></script>', 'name="app-build" content="' + PLACEHOLDER + '"',
      'rel="apple-touch-icon"', 'apple-mobile-web-app-capable', 'apple-mobile-web-app-status-bar-style',
      'media="(prefers-color-scheme: dark)"', 'media="(prefers-color-scheme: light)"']) {
      assert.ok(html.includes(needle), name + ': ' + needle);
    }
  }
});

test('build-foryou embedding keeps the PWA markup intact', () => {
  const html = read('foryou.html');
  const out = embedData(html, { version: 1, accounts: [] }, {});
  for (const needle of ['<script src="pwa.js" defer></script>', 'name="app-build"', 'rel="manifest"']) assert.ok(out.includes(needle), needle);
});

test('dataStampOf picks the newest account updatedAt', () => {
  assert.equal(dataStampOf({ accounts: [{ updatedAt: '2026-10-07T19:15:00+09:00' }, { updatedAt: '2026-10-08T07:23:26+09:00' }, { updatedAt: 'bad' }, {}] }), '2026-10-07T22:23:26.000Z');
  assert.equal(dataStampOf({ accounts: [] }), null);
  assert.equal(dataStampOf(null), null);
});

test('stamp writes build id into sw.js / pages and emits version.json', t => {
  const dir = mkdtempSync(join(process.cwd(), '.test-pwa-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const name of STAMPED_FILES) writeFileSync(join(dir, name), read(name));
  writeFileSync(join(dir, 'foryou-data.json'), JSON.stringify({ accounts: [{ updatedAt: '2026-10-08T07:23:26+09:00' }] }));
  const dirUrl = pathToFileURL(dir + '/');
  const v = stamp(dirUrl, 'abc123def456', new Date('2026-10-08T00:00:00Z'));
  assert.deepEqual(v, { build: 'abc123def456', builtAt: '2026-10-08T00:00:00.000Z', dataStamp: '2026-10-07T22:23:26.000Z' });
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'version.json'), 'utf8')), v);
  for (const name of STAMPED_FILES) {
    const text = readFileSync(join(dir, name), 'utf8');
    assert.ok(!text.includes(PLACEHOLDER), name + ' stamped');
    assert.ok(text.includes('abc123def456'), name + ' has build id');
  }
  assert.match(readFileSync(join(dir, 'sw.js'), 'utf8'), /const BUILD_ID = 'abc123def456';/);
  // 2回目は置き換え対象がないのでエラー（二重スタンプ防止）
  assert.throws(() => stamp(dirUrl, 'zzz'), /placeholder missing/);
});

test('stamp rejects unsafe build ids', t => {
  const dir = mkdtempSync(join(process.cwd(), '.test-pwa-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const bad of ['', 'a b', "x';alert(1)//", PLACEHOLDER]) assert.throws(() => stamp(pathToFileURL(dir + '/'), bad), /Invalid build id/);
});
