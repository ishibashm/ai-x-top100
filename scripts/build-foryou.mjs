import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const data = JSON.parse(readFileSync(new URL('foryou-data.json', root), 'utf8'));
if (!Array.isArray(data.accounts) || data.accounts.length < 1) throw Error('At least one account is required');
const handles = new Set();
for (const account of data.accounts) {
  if (typeof account.name !== 'string' || !account.name || typeof account.handle !== 'string' || !account.handle || typeof account.sample !== 'boolean' || !Array.isArray(account.posts)) throw Error('Invalid account: ' + (account && account.handle));
  if (handles.has(account.handle)) throw Error('Duplicate account handle: ' + account.handle);
  handles.add(account.handle);
  const ids = new Set();
  for (const p of account.posts) {
    if (typeof p.id !== 'string' || !p.id || ids.has(p.id) || typeof p.handle !== 'string' || typeof p.text !== 'string' || typeof (p.author ?? p.name) !== 'string') throw Error('Invalid or duplicate post: ' + account.handle + ' ' + (p && p.id));
    if (p.textJa !== undefined && (typeof p.textJa !== 'string' || !p.textJa.trim())) throw Error('Invalid Japanese translation: ' + p.id);
    if (p.lang !== undefined && (typeof p.lang !== 'string' || !/^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/.test(p.lang))) throw Error('Invalid source language: ' + p.id);
    ids.add(p.id);
  }
}
const escaped = JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const path = fileURLToPath(new URL('foryou.html', root));
const html = readFileSync(path, 'utf8');
const marker = /(<script[^>]*\bid=["']foryou-data["'][^>]*>)[\s\S]*?(<\/script>)/;
if (!marker.test(html)) throw Error('Embedded data marker missing');
const result = html.replace(marker, (_, start, end) => start + escaped + end);
if (process.argv.includes('--check')) {
  if (result !== html) throw Error('Embedded data is stale. Run node scripts/build-foryou.mjs');
  console.log('For You data validated; embedded data is up to date for ' + data.accounts.length + ' accounts.');
} else {
  writeFileSync(path, result);
  console.log('Updated foryou.html with data for ' + data.accounts.length + ' accounts.');
}
