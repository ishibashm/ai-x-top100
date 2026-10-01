import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { build, validateData, validateBuzz, escapeJson, embedData } from '../scripts/build-foryou.mjs';
import { scorePost, badgeForScore, predictBuzz, parseArgs, main, calibrate, spearman } from '../scripts/predict-buzz.mjs';

const post = { id: 'post-a', author: '作者', handle: 'author', text: '本文' };
const data = { accounts: [{ name: 'A', handle: 'a', sample: false, posts: [post] }] };
const prediction = { score: 70, badge: '🔥高', source: 'opus', reasonJa: '根拠' };
const html = '<script type="application/json" id="foryou-data">{}</script>\n<script type="application/json" id="buzz-data">{}</script>';

function fixture(t) {
  const dir = mkdtempSync(join(process.cwd(), '.test-foryou-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'foryou-data.json'), JSON.stringify(data));
  writeFileSync(join(dir, 'foryou.html'), html);
  return { dir, root: pathToFileURL(dir + '/') };
}

test('data validation retains existing checks', () => {
  validateData(data);
  for (const invalid of [ { accounts: [] }, { accounts: [...data.accounts, ...data.accounts] },
    { accounts: [{ ...data.accounts[0], posts: [post, post] }] },
    { accounts: [{ ...data.accounts[0], posts: [{ ...post, textJa: ' ' }] }] }]) {
    assert.throws(() => validateData(invalid));
  }
});

test('buzz validation rejects malformed entries and only warns for stale IDs', () => {
  for (const invalid of [null, [], 1, 'x']) assert.throws(() => validateBuzz(invalid, data));
  for (const patch of [{ score: -1 }, { score: 101 }, { score: NaN }, { score: Infinity },
    { score: '70' }, { badge: 1 }, { source: 'api' }, { reasonJa: '' }, { reasonJa: ' ' }, { reasonJa: null }]) {
    assert.throws(() => validateBuzz({ 'post-a': { ...prediction, ...patch } }, data));
  }
  for (const invalid of [null, [], 1]) assert.throws(() => validateBuzz({ 'post-a': invalid }, data));
  const warnings = [];
  validateBuzz({ old: prediction, 'post-a': { score: 0, badge: '', source: 'local' } }, data, w => warnings.push(w));
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /old/);
  validateBuzz({ 'post-a': { ...prediction, score: 100 } }, data);
});

test('both embedded blocks escape script delimiters and special characters', () => {
  const value = '</script><>&\u2028\u2029';
  const escaped = escapeJson({ value });
  assert.doesNotMatch(escaped, /[<>&\u2028\u2029]/);
  assert.deepEqual(JSON.parse(escaped), { value });
  const result = embedData(html, { value }, { value });
  assert.equal(result.split(escaped).length, 3);
  assert.throws(() => embedData('', data, {}), /marker missing/);
  assert.throws(() => embedData(html.split('\n')[0], data, {}), /buzz-data/);
});

test('build supports missing buzz file and detects stale data in either block', t => {
  const { dir, root } = fixture(t);
  build(root);
  build(root, true);
  assert.match(readFileSync(join(dir, 'foryou.html'), 'utf8'), /id="buzz-data">\{\}/);
  writeFileSync(join(dir, 'foryou-buzz.json'), JSON.stringify({ 'post-a': prediction }));
  assert.throws(() => build(root, true), /stale/);
  build(root);
  build(root, true);
  writeFileSync(join(dir, 'foryou-data.json'), JSON.stringify({ accounts: [{ ...data.accounts[0], name: 'changed' }] }));
  assert.throws(() => build(root, true), /stale/);
});

test('scores are deterministic integers in range with threshold badges', () => {
  for (const [score, badge] of [[0, '・低'], [44, '・低'], [45, '↗中'], [69, '↗中'], [70, '🔥高'], [100, '🔥高']]) {
    assert.equal(badgeForScore(score), badge);
  }
  for (const n of [undefined, -1, NaN, Infinity, 0, 1, 1200, 1e6, Number.MAX_VALUE]) {
    const p = { ...post, metrics: { views: n, likes: n }, media: 'image.jpg', createdAt: '2026-09-18T00:00:00Z' };
    const score = scorePost(p, '2026-09-19T00:00:00Z');
    assert.deepEqual(score, scorePost(p, '2026-09-19T00:00:00Z'));
    assert.ok(Number.isInteger(score.score) && score.score >= 0 && score.score <= 100);
    assert.equal(score.badge, badgeForScore(score.score));
    assert.equal(score.source, 'local');
    assert.ok(score.reasonJa.length);
  }
  assert.equal(scorePost({ text: '' }).score, 0);
  assert.match(scorePost({ ...post, metrics: { views: 12000, likes: 252 } }).reasonJa, /1.2万表示.*いいね率2.1%/);
  const dated = { ...post, metrics: { views: 1000, likes: 10 }, createdAt: '2026-09-18T00:00:00Z' };
  assert.ok(scorePost(dated, '2026-09-18T00:00:00Z').score > scorePost(dated, '2026-09-28T00:00:00Z').score);
  assert.deepEqual(scorePost(dated, 'invalid'), scorePost(dated));
});

test('merge preserves opus/jev, existing order, account scope, and global prune', () => {
  const input = { accounts: [
    { ...data.accounts[0], posts: [post, { ...post, id: 'new-a' }, { ...post, id: 'local' }] },
    { ...data.accounts[0], handle: 'b', posts: [{ ...post, id: 'jev' }, { ...post, id: 'new-b' }] }
  ] };
  const existing = { old: prediction, jev: { ...prediction, source: 'jev' }, 'post-a': prediction, local: { score: 100, badge: '🔥高', source: 'local' } };
  const snapshot = JSON.stringify(existing);
  const { buzz } = predictBuzz(input, existing);
  assert.deepEqual(Object.keys(buzz), ['old', 'jev', 'post-a', 'local', 'new-a', 'new-b']);
  assert.deepEqual(buzz.jev, existing.jev);
  assert.deepEqual(buzz['post-a'], prediction);
  assert.notDeepEqual(buzz.local, existing.local);
  assert.equal(JSON.stringify(existing), snapshot);
  assert.deepEqual(predictBuzz(input, buzz).buzz, buzz);
  const scoped = predictBuzz(input, existing, { account: 'a', prune: true }).buzz;
  assert.ok(!Object.hasOwn(scoped, 'old') && !Object.hasOwn(scoped, 'new-b'));
  assert.deepEqual(scoped.jev, existing.jev);
  assert.throws(() => predictBuzz(input, existing, { account: 'missing' }), /Unknown account/);
});

test('duplicate IDs use first selected account consistently', () => {
  const input = { accounts: [data.accounts[0], { ...data.accounts[0], handle: 'b', posts: [{ ...post, media: 'image' }] }] };
  assert.deepEqual(predictBuzz(input, {}).buzz['post-a'], scorePost(post));
  assert.deepEqual(predictBuzz(input, {}, { account: 'b' }).buzz['post-a'], scorePost(input.accounts[1].posts[0]));
});

test('CLI dry-run/help do not write; missing source is generated deterministically', t => {
  const { dir, root } = fixture(t);
  main(['--help'], root);
  main(['--dry-run'], root);
  assert.throws(() => readFileSync(join(dir, 'foryou-buzz.json')), /ENOENT/);
  main([], root);
  const before = readFileSync(join(dir, 'foryou-buzz.json'));
  main(['--dry-run', '--prune'], root);
  assert.deepEqual(readFileSync(join(dir, 'foryou-buzz.json')), before);
  main([], root);
  assert.deepEqual(readFileSync(join(dir, 'foryou-buzz.json')), before);
  assert.throws(() => parseArgs(['--account']), /requires/);
  assert.throws(() => parseArgs(['--unknown']), /Unknown option/);
});

test('imports do not execute CLI', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', "import './scripts/build-foryou.mjs'; import './scripts/predict-buzz.mjs';"], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});


// 実データの統計値はデータ更新ごとに変わるため、ここでは構造的な性質だけを検証します。
// キャリブレーションの品質は node scripts/predict-buzz.mjs --calibrate で確認します。
test('repository calibration report is well-formed and the fixed offset keeps ranks', () => {
  const input = JSON.parse(readFileSync(new URL('../foryou-data.json', import.meta.url)));
  const existing = JSON.parse(readFileSync(new URL('../foryou-buzz.json', import.meta.url)));
  const local = Object.values(predictBuzz(input, existing).buzz).filter(p => p.source === 'local');
  for (const p of local) assert.ok(Number.isInteger(p.score) && p.score >= 0 && p.score <= 100);
  const report = calibrate(input, existing);
  assert.ok(report.count > 0);
  for (const key of ['modelMean', 'localMean', 'meanAbsoluteError']) assert.ok(Number.isFinite(report[key]));
  assert.ok(report.spearman === null || (report.spearman >= -1 && report.spearman <= 1));
  const modelScores = [], scores = [], seen = new Set();
  for (const a of input.accounts) for (const p of a.posts) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    if (!['opus', 'jev'].includes(existing[p.id]?.source)) continue;
    modelScores.push(existing[p.id].score);
    scores.push(scorePost(p, a.updatedAt).score);
  }
  assert.equal(spearman(modelScores, scores), spearman(modelScores, scores.map(s => s + 12)));
});

test('calibrate never writes, including with prune or a missing buzz file', t => {
  const { dir, root } = fixture(t);
  main(['--calibrate'], root);
  assert.throws(() => readFileSync(join(dir, 'foryou-buzz.json')), /ENOENT/);
  writeFileSync(join(dir, 'foryou-buzz.json'), JSON.stringify({ 'post-a': prediction, stale: prediction }));
  const files = ['foryou-data.json', 'foryou-buzz.json', 'foryou.html'];
  const before = files.map(file => readFileSync(join(dir, file)));
  main(['--calibrate', '--prune'], root);
  files.forEach((file, i) => assert.deepEqual(readFileSync(join(dir, file)), before[i]));
  assert.equal(calibrate(data, { 'post-a': prediction, stale: prediction }).count, 1);
});

test('Spearman handles ties and undefined correlations', () => {
  assert.equal(spearman([1, 2, 2], [2, 1, 1]), -1);
  assert.ok(Math.abs(spearman([1, 2, 3], [1, 2, 2]) - Math.sqrt(3) / 2) < 1e-12);
  assert.equal(spearman([], []), null);
  assert.equal(spearman([1], [2]), null);
  assert.equal(spearman([1, 1], [2, 3]), null);
});
