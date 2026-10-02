import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateData } from './build-foryou.mjs';

export const defaultDataPath = fileURLToPath(new URL('../foryou-data.json', import.meta.url));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && Boolean(value.trim());
const handle = value => typeof value === 'string' ? value.replace(/^@/, '') : value;

export function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) { throw Error(`${path}: JSON: ${error.message}`); }
}

// 元ファイルのインデント・改行・末尾改行を維持します。
export function formatData(data, source) {
  const indent = source.match(/\r?\n([ \t]+)"/)?.[1] ?? '';
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  return JSON.stringify(data, null, indent).replace(/\n/g, newline) + (source.endsWith('\n') ? newline : '');
}

export function isTimestamp(value) {
  if (typeof value !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/i.exec(value);
  if (!m || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day, hour, minute, second, , zoneHour, zoneMinute] = m;
  const days = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  return +month >= 1 && +month <= 12 && +day >= 1 && +day <= days && +hour < 24 && +minute < 60 && +second < 60 && +(zoneHour ?? 0) < 24 && +(zoneMinute ?? 0) < 60;
}

export function normalizePost(post, context) {
  const fail = (field, message) => { throw Error(`${context}: ${field}: ${message}`); };
  if (!object(post)) fail('post', 'オブジェクトが必要です');
  // 任意項目の null は未指定として扱います（取得スクリプトの欠損値対策）。
  post = Object.fromEntries(Object.entries(post).filter(([key, value]) => !(value === null && ['url', 'media', 'avatar', 'createdAt', 'lang', 'textJa', 'views', 'likes', 'reposts', 'replies'].includes(key))));
  if (typeof post.id !== 'string' || !/^\d+$/.test(post.id)) fail('id', '数字文字列が必要です');
  const author = post.author ?? post.name;
  if (!nonempty(author)) fail('author/name', '表示名が必要です');
  const authorHandle = handle(post.handle);
  if (!nonempty(authorHandle) || !/^[A-Za-z0-9_]+$/.test(authorHandle)) fail('handle', '有効なハンドルが必要です');
  if (typeof post.text !== 'string') fail('text', '文字列が必要です');
  for (const key of ['url', 'media', 'avatar']) {
    if (post[key] === undefined) continue;
    let valid = false;
    try { valid = typeof post[key] === 'string' && /^https?:$/.test(new URL(post[key]).protocol); } catch {}
    if (!valid) fail(key, 'http(s) URL文字列が必要です');
  }
  if (post.createdAt !== undefined && !isTimestamp(post.createdAt)) fail('createdAt', 'タイムゾーン付きISO8601日時が必要です');
  if (post.lang !== undefined && (typeof post.lang !== 'string' || !/^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/.test(post.lang))) fail('lang', '言語コードが不正です');
  if (post.textJa !== undefined && !nonempty(post.textJa)) fail('textJa', '空でない文字列が必要です');
  const result = { id: post.id, author, handle: authorHandle, text: post.text, url: post.url ?? `https://x.com/${authorHandle}/status/${post.id}` };
  for (const key of ['createdAt', 'media', 'avatar']) if (post[key] !== undefined) result[key] = post[key];
  result.metrics = {};
  for (const key of ['views', 'likes', 'reposts', 'replies']) {
    if (post[key] === undefined) continue;
    if (typeof post[key] !== 'number' || !Number.isFinite(post[key]) || post[key] < 0) fail(key, '0以上の有限数が必要です（数値文字列は不可）');
    result.metrics[key] = post[key];
  }
  for (const key of ['lang', 'textJa']) if (post[key] !== undefined) result[key] = post[key];
  return result;
}

export function importData(data, sources, { max = 100, allowEmpty = false } = {}) {
  validateData(data);
  if (!Number.isSafeInteger(max) || max < 1) throw Error('--max: 正の整数が必要です');
  const replacements = new Map(), warnings = [], summaries = [];
  for (const { filename, value } of sources) {
    const entries = object(value) && Object.hasOwn(value, 'accounts') ? value.accounts : [value];
    if (!Array.isArray(entries) || !entries.length) throw Error(`${filename}: accounts: 空でない配列が必要です`);
    for (const entry of entries) {
      const account = handle(entry?.account);
      const context = `${filename}: account=${account ?? '?'} posts[index/id]=—`;
      const fail = (field, message) => { throw Error(`${context}: ${field}: ${message}`); };
      if (!object(entry) || !nonempty(account)) fail('account', 'アカウントが必要です');
      const old = data.accounts.find(a => a.handle === account);
      if (!old) fail('account', '存在しないアカウントです');
      if (replacements.has(account)) fail('account', '同一アカウントが複数回指定されています');
      if (!isTimestamp(entry.fetchedAt)) fail('fetchedAt', 'タイムゾーン付きISO8601日時が必要です');
      if (!Array.isArray(entry.posts)) fail('posts', '配列が必要です');
      if (!entry.posts.length && !allowEmpty) fail('posts', '0件の取得です。許可する場合は --allow-empty');
      const seen = new Set(), posts = [];
      entry.posts.forEach((p, index) => {
        const postContext = `${filename}: account=${account} posts[${index}] id=${p?.id ?? '?'}`;
        const normalized = normalizePost(p, postContext);
        if (seen.has(normalized.id)) { warnings.push(`${postContext}: id: 重複のため最初の投稿を採用`); return; }
        seen.add(normalized.id);
        if (posts.length < max) posts.push(normalized);
      });
      const previous = new Map(old.posts.map(p => [p.id, p]));
      let inherited = 0;
      for (const p of posts) {
        const prior = previous.get(p.id);
        if (p.textJa === undefined && prior?.textJa !== undefined && prior.text === p.text) {
          p.textJa = prior.textJa;
          if (prior.lang !== undefined) p.lang = prior.lang;
          inherited++;
        }
      }
      const continued = posts.filter(p => previous.has(p.id)).length;
      summaries.push({ account, before: old.posts.length, after: posts.length, added: posts.length - continued, continued, removed: old.posts.length - continued, inherited });
      replacements.set(account, { ...old, updatedAt: entry.fetchedAt, sample: false, posts });
    }
  }
  const result = { ...data, accounts: data.accounts.map(a => replacements.get(a.handle) ?? a) };
  validateData(result);
  return { data: result, warnings, summaries };
}

export function parseArgs(args) {
  const options = { inputs: [], data: defaultDataPath };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (['--max', '--data'].includes(arg)) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw Error(`${arg}: 値が必要です`);
      const value = args[++i];
      if (arg === '--max') {
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(+value) || +value < 1) throw Error('--max: 正の整数が必要です');
        options.max = +value;
      } else options.data = value;
    } else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--allow-empty') options.allowEmpty = true;
    else if (arg === '--help') options.help = true;
    else if (arg.startsWith('-')) throw Error(`不明なオプション: ${arg}`);
    else options.inputs.push(arg);
  }
  return options;
}

export function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.help) {
    console.log('Usage: node scripts/import-foryou.mjs FILE|DIR [...] [--dry-run] [--max N] [--allow-empty] [--data PATH] [--help]\n取得JSONをアカウント単位で置換します。ディレクトリは直下の*.jsonを名前順に読み込みます。\n--dry-run      保存せず要約を表示\n--max N        上限（正の整数、既定100＝50件×2ページ）\n--allow-empty  0件の取得を許可\n--data PATH    更新先（既定: リポジトリのforyou-data.json）');
    return;
  }
  if (!options.inputs.length) throw Error('入力FILEまたはDIRを1つ以上指定してください');
  const paths = options.inputs.flatMap(path => statSync(path).isDirectory()
    ? readdirSync(path, { withFileTypes: true }).filter(e => e.isFile() && e.name.endsWith('.json')).map(e => e.name).sort().map(name => join(path, name)) : [path]);
  if (!paths.length) throw Error('入力ディレクトリに*.jsonがありません');
  const source = readFileSync(options.data, 'utf8');
  const result = importData(readJson(options.data), paths.map(filename => ({ filename, value: readJson(filename) })), options);
  for (const warning of result.warnings) console.warn(`Warning: ${warning}`);
  for (const s of result.summaries) console.log(`${options.dryRun ? '[dry-run] ' : ''}${s.account}: ${s.before}→${s.after}件・新規=${s.added} 継続=${s.continued} 消えた=${s.removed} 引き継いだ訳=${s.inherited}`);
  if (!options.dryRun) writeFileSync(options.data, formatData(result.data, source));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
