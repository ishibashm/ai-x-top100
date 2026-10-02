import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateData } from './build-foryou.mjs';
import { defaultDataPath, formatData, readJson } from './import-foryou.mjs';

export function listTranslations(data, { account, all = false } = {}) {
  validateData(data);
  account = account?.replace(/^@/, '');
  if (account !== undefined && !data.accounts.some(a => a.handle === account)) throw Error(`account: 存在しないアカウント: ${account}`);
  const entries = new Map();
  for (const a of data.accounts) {
    if (account !== undefined && a.handle !== account) continue;
    for (const p of a.posts) {
      if (p.textJa !== undefined || (!all && (!p.text.trim() || /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(p.text)))) continue;
      // 同じIDは最初の対象アカウントを代表として出力します。
      if (!entries.has(p.id)) entries.set(p.id, { account: a.handle, handle: p.handle, text: p.text });
    }
  }
  return Object.fromEntries(entries);
}

export function applyTranslations(data, translations, filename = 'translations') {
  validateData(data);
  if (!translations || typeof translations !== 'object' || Array.isArray(translations)) throw Error(`${filename}: translations: IDと訳のオブジェクトが必要です`);
  for (const [id, value] of Object.entries(translations)) {
    if (typeof value !== 'string' || !value.trim()) throw Error(`${filename}: id=${id}: textJa: 空でない文字列が必要です`);
  }
  const found = new Set();
  let applied = 0;
  const result = { ...data, accounts: data.accounts.map(a => ({ ...a, posts: a.posts.map(p => {
    if (!Object.hasOwn(translations, p.id)) return p;
    found.add(p.id);
    applied++;
    return { ...p, textJa: translations[p.id] };
  }) })) };
  validateData(result);
  return { data: result, applied, warnings: Object.keys(translations).filter(id => !found.has(id)).map(id => `${filename}: id=${id}: 存在しないid`) };
}

export function parseArgs(args) {
  if (args.includes('--help')) return { help: true };
  const [command, ...rest] = args;
  if (!['list', 'apply'].includes(command)) throw Error('list または apply FILE を指定してください');
  const options = { command, data: defaultDataPath };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--data' || (command === 'list' && ['--out', '--account'].includes(arg))) {
      if (!rest[i + 1] || rest[i + 1].startsWith('--')) throw Error(`${arg}: 値が必要です`);
      options[arg.slice(2)] = rest[++i];
    } else if (command === 'list' && arg === '--all') options.all = true;
    else if (command === 'apply' && arg === '--dry-run') options.dryRun = true;
    else if (command === 'apply' && !arg.startsWith('-') && !options.file) options.file = arg;
    else throw Error(`不明な引数: ${arg}`);
  }
  if (command === 'apply' && !options.file) throw Error('apply: 翻訳FILEが必要です');
  return options;
}

export function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.help) {
    console.log('Usage: node scripts/foryou-translations.mjs list [--out FILE] [--account HANDLE] [--all] [--data PATH]\n       node scripts/foryou-translations.mjs apply FILE [--dry-run] [--data PATH]\nlist: 未翻訳の候補を出力（同一IDは最初のアカウント）。--all は空本文を含む未翻訳全件。\napply: ID別の日本語訳を全アカウントに反映。--help でヘルプ表示。');
    return;
  }
  const source = readFileSync(options.data, 'utf8');
  const data = readJson(options.data);
  if (options.command === 'list') {
    const output = JSON.stringify(listTranslations(data, options), null, 2) + '\n';
    if (options.out) {
      if (resolve(options.out) === resolve(options.data)) throw Error('--out: データファイルと異なるパスを指定してください');
      writeFileSync(options.out, output);
    } else process.stdout.write(output);
    return;
  }
  const result = applyTranslations(data, readJson(options.file), options.file);
  for (const warning of result.warnings) console.warn(`Warning: ${warning}`);
  if (!options.dryRun) writeFileSync(options.data, formatData(result.data, source));
  console.log(`${options.dryRun ? '[dry-run] ' : ''}翻訳適用: ${result.applied}件`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
