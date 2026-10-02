import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, copyFileSync, openSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { listTranslations, applyTranslations } from '../scripts/foryou-translations.mjs';


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

const post = { id: '1', author: '作者', handle: 'writer', text: 'Hello' };
const data = { accounts: [
  { name: 'A', handle: 'a', sample: false, posts: [post, { ...post, id: '2', text: 'こんにちは' }, { ...post, id: '3', text: 'カタカナ' }, { ...post, id: '4', text: '中文' }, { ...post, id: '5', text: '' }, { ...post, id: '6', textJa: '翻訳済み' }, { ...post, id: '7', text: 'ｶﾀｶﾅ' }] },
  { name: 'B', handle: 'b', sample: false, posts: [post] }
] };

test('list filters untranslated text and account, all includes empty text', () => {
  assert.deepEqual(Object.keys(listTranslations(data)), ['1', '4']);
  assert.deepEqual(listTranslations(data)['1'], { account: 'a', handle: 'writer', text: 'Hello' });
  assert.deepEqual(Object.keys(listTranslations(data, { all: true })), ['1', '2', '3', '4', '5', '7']);
  assert.equal(listTranslations(data, { account: '@b' })['1'].account, 'b');
  assert.throws(() => listTranslations(data, { account: 'missing' }), /account/);
});

test('apply updates all matching accounts, warns unknown IDs, validates before mutation', () => {
  const snapshot = structuredClone(data);
  const result = applyTranslations(data, { 1: 'こんにちは', 999: '未知' }, 'ja.json');
  assert.equal(result.applied, 2);
  for (const a of result.data.accounts) assert.equal(a.posts[0].textJa, 'こんにちは');
  assert.match(result.warnings[0], /ja.json.*999/);
  assert.deepEqual(data, snapshot);
  for (const value of ['', ' ', null, 1]) assert.throws(() => applyTranslations(data, { 1: value }, 'ja.json'), /ja.json.*id=1.*textJa/);
  for (const value of [null, [], 'text']) assert.throws(() => applyTranslations(data, value));
});

test('CLI list stdout/out, apply dry-run/save and invalid translation never writes', t => {
  const dir = mkdtempSync(join(process.cwd(), '.test-translations-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'data.json');
  copyFileSync(new URL('../foryou-data.json', import.meta.url), path);
  const original = readFileSync(path, 'utf8');
  const script = fileURLToPath(new URL('../scripts/foryou-translations.mjs', import.meta.url));
  const cli = args => runCli(process.execPath, [script, ...args, '--data', path], { encoding: 'utf8', cwd: dir });
  let result = cli(['list']);
  assert.equal(result.status, 0, result.stderr);
  const pending = JSON.parse(result.stdout);
  const id = Object.keys(pending)[0];
  assert.ok(id);
  const out = join(dir, 'pending.json');
  result = cli(['list', '--out', out]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(readFileSync(out)), pending);
  assert.equal(result.stdout, '');
  const translations = join(dir, 'ja.json');
  writeFileSync(translations, JSON.stringify({ [id]: '日本語訳', unknown: '不明' }));
  result = cli(['apply', translations, '--dry-run']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /unknown/);
  assert.equal(readFileSync(path, 'utf8'), original);
  result = cli(['apply', translations]);
  assert.equal(result.status, 0, result.stderr);
  const saved = readFileSync(path, 'utf8');
  for (const a of JSON.parse(saved).accounts) for (const p of a.posts) if (p.id === id) assert.equal(p.textJa, '日本語訳');
  writeFileSync(translations, JSON.stringify({ [id]: '' }));
  assert.notEqual(cli(['apply', translations]).status, 0);
  assert.equal(readFileSync(path, 'utf8'), saved);
  for (const args of [['apply'], ['list', '--account', 'missing'], ['list', '--dry-run'], ['apply', translations, '--all']]) assert.notEqual(cli(args).status, 0);
});
