import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, copyFileSync, openSync, closeSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { importData, formatData, isTimestamp } from '../scripts/import-foryou.mjs';
import { validateData, embedData } from '../scripts/build-foryou.mjs';


// 制限環境でも子プロセスを検証できるよう、出力をパイプではなくファイルで受けます。
function runCli(command, args, options = {}) {
  const dir = mkdtempSync(join(process.cwd(), '.test-cli-'));
  const stdout = join(dir, 'stdout'), stderr = join(dir, 'stderr');
  const out = openSync(stdout, 'w'), err = openSync(stderr, 'w');
  try {
    const result = spawnSync(command, args, { ...options, stdio: ['ignore', out, err] });
    if (result.error) throw result.error;
    return { ...result, stdout: readFileSync(stdout, 'utf8'), stderr: readFileSync(stderr, 'utf8') };
  } finally {
    closeSync(out);
    closeSync(err);
    rmSync(dir, { recursive: true, force: true });
  }
}

const p = { id: '1', author: '作者', handle: 'writer', text: 'Hello' };
const data = { version: 7, extra: 'keep', accounts: [
  { name: 'A', handle: 'a', sample: true, posts: [{ ...p, textJa: 'こんにちは', lang: 'en' }, { ...p, id: '2', textJa: '古い訳', lang: 'en' }] },
  { name: 'B', handle: 'b', sample: true, posts: [] }
] };
const entry = (posts = [p], account = 'a') => ({ account, fetchedAt: '2026-10-03T07:31:00+09:00', posts });
const run = (value, options) => importData(data, [{ filename: 'fetch.json', value }], options);
const script = fileURLToPath(new URL('../scripts/import-foryou.mjs', import.meta.url));

function fixture(t) {
  const dir = mkdtempSync(join(process.cwd(), '.test-import-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'data.json');
  copyFileSync(new URL('../foryou-data.json', import.meta.url), path);
  return { dir, path, cli: args => runCli(process.execPath, [script, '--data', path, ...args], { encoding: 'utf8', cwd: dir }) };
}

test('single account normalizes fields and inherits translations without mutating inputs', () => {
  const before = structuredClone(data);
  const result = run(entry([{ ...p, author: undefined, name: '別名', handle: '@writer', views: 0, likes: 2, reposts: 3, replies: 4 }, { ...p, id: '2', text: 'changed' }, { ...p, id: '3', text: '' }], '@a'));
  const account = result.data.accounts[0];
  assert.equal(account.sample, false);
  assert.equal(account.updatedAt, entry().fetchedAt);
  assert.deepEqual(account.posts[0], { ...p, author: '別名', url: 'https://x.com/writer/status/1', metrics: { views: 0, likes: 2, reposts: 3, replies: 4 }, textJa: 'こんにちは', lang: 'en' });
  assert.equal(account.posts[1].textJa, undefined);
  assert.equal(account.posts[1].lang, undefined);
  assert.deepEqual(result.data.accounts[1], data.accounts[1]);
  assert.equal(result.data.extra, 'keep');
  assert.equal(result.data.version, 7);
  assert.deepEqual(data, before);
  assert.deepEqual(result.summaries[0], { account: 'a', before: 2, after: 3, added: 1, continued: 2, removed: 0, inherited: 1 });
  validateData(result.data);
  assert.match(embedData('<script id="foryou-data"></script><script id="buzz-data"></script>', result.data, {}), /"reposts":3,"replies":4/);
});

test('multiple accounts, duplicate warning, limit and explicit translation', () => {
  const result = run({ accounts: [entry([{ ...p, textJa: '新訳', lang: 'fr' }, { ...p, text: 'duplicate' }, { ...p, id: '3' }, { ...p, id: '4' }]), entry([p], 'b')] }, { max: 2 });
  assert.deepEqual(result.data.accounts[0].posts.map(p => p.id), ['1', '3']);
  assert.equal(result.data.accounts[0].posts[0].textJa, '新訳');
  assert.equal(result.summaries[0].inherited, 0);
  assert.equal(result.summaries[0].removed, 1);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /fetch.json.*account=a.*posts\[1\].*id=1.*重複/);
  assert.equal(result.data.accounts[1].posts.length, 1);
  assert.equal(run(entry(Array.from({ length: 101 }, (_, i) => ({ ...p, id: String(i) })))).data.accounts[0].posts.length, 100);
});

test('invalid fields identify file, account, index, id and field', () => {
  for (const [field, value] of [['id', 1], ['id', 'x'], ['author', ''], ['handle', '@'], ['text', null], ['views', '1.2万'], ['likes', '12K'], ['reposts', -1], ['replies', Infinity], ['views', NaN], ['url', 'bad'], ['media', 3], ['avatar', 'javascript:alert(1)'], ['createdAt', '2026-10-03T07:00:00'], ['lang', 'English'], ['textJa', ' ']]) {
    assert.throws(() => run(entry([{ ...p, [field]: value }])), error => {
      assert.match(error.message, /fetch.json.*account=a.*posts\[0\].*id=/);
      assert.ok(error.message.includes(field));
      return true;
    });
  }
  assert.throws(() => run(entry([], 'missing')), /account.*存在しない/);
  assert.throws(() => run({ accounts: [entry(), entry()] }), /account.*複数回/);
  assert.throws(() => run({ ...entry(), fetchedAt: 'yesterday' }), /fetchedAt/);
  assert.throws(() => run(entry([])), /0件/);
  assert.deepEqual(run(entry([]), { allowEmpty: true }).data.accounts[0].posts, []);
  for (const value of [null, { accounts: [] }, { accounts: {} }, { ...entry(), posts: {} }]) assert.throws(() => run(value));
  assert.equal(isTimestamp('2026-02-30T00:00:00Z'), false);
  assert.equal(isTimestamp('2026-10-03T07:31:00.123456Z'), true);
});

test('format preserves current repository format and alternate whitespace', () => {
  const source = readFileSync(new URL('../foryou-data.json', import.meta.url), 'utf8');
  assert.equal(formatData(JSON.parse(source), source), source);
  const alternate = JSON.stringify(data, null, '\t').replace(/\n/g, '\r\n');
  assert.equal(formatData(data, alternate), alternate);
});

test('CLI directory order, dry-run, save, invalid input and options', t => {
  const { dir, path, cli } = fixture(t);
  const original = readFileSync(path, 'utf8');
  const input = join(dir, 'fetch');
  mkdirSync(input);
  writeFileSync(join(input, 'b.json'), JSON.stringify(entry([p], 'cloud8wq')));
  writeFileSync(join(input, 'a.json'), JSON.stringify(entry([p], 'oshiyasu229196')));
  writeFileSync(join(input, 'ignored.txt'), 'invalid');
  let result = cli([input, '--dry-run']);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.indexOf('oshiyasu229196') < result.stdout.indexOf('cloud8wq'));
  assert.equal(readFileSync(path, 'utf8'), original);
  result = cli([input]);
  assert.equal(result.status, 0, result.stderr);
  const saved = readFileSync(path, 'utf8');
  const parsed = JSON.parse(saved);
  assert.deepEqual(parsed.accounts.slice(0, 2), JSON.parse(original).accounts.slice(0, 2));
  assert.equal(parsed.accounts[3].posts[0].url, 'https://x.com/writer/status/1');
  assert.equal(saved, formatData(parsed, original));
  writeFileSync(join(input, 'b.json'), JSON.stringify(entry([{ ...p, likes: '12K' }], 'cloud8wq')));
  result = cli([input]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /b.json.*cloud8wq.*posts\[0\].*id=1.*likes/);
  assert.equal(readFileSync(path, 'utf8'), saved);
  for (const args of [[], ['--max', '0'], ['--max', '1.5'], ['--max'], ['--data'], ['--bad']]) assert.notEqual(cli(args).status, 0);
  assert.equal(cli(['--help']).status, 0);
});

test('new scripts can be imported without CLI side effects', () => {
  const scripts = ['import-foryou', 'foryou-translations'].map(name => new URL(`../scripts/${name}.mjs`, import.meta.url).href);
  const result = runCli(process.execPath, ['--input-type=module', '-e', scripts.map(url => `import ${JSON.stringify(url)};`).join('\n')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout + result.stderr, '');
});

test('optional null fields are treated as absent', () => {
  const data = { version: 1, accounts: [{ name: 'A', handle: 'a', sample: false, posts: [] }] };
  const post = { id: '1', author: 'X', handle: 'x', text: 'hi', createdAt: null, media: null, views: null, url: null };
  const { data: out } = importData(data, [{ filename: 'f.json', value: { account: 'a', fetchedAt: '2026-10-03T07:30:00+09:00', posts: [post] } }]);
  assert.deepEqual(out.accounts[0].posts[0], { id: '1', author: 'X', handle: 'x', text: 'hi', url: 'https://x.com/x/status/1', metrics: {} });
});
