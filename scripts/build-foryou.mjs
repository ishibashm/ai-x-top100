import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const data = JSON.parse(readFileSync(new URL('foryou-data.json', root), 'utf8'));
const expected = ['GazerStar79330', 'N8jhSzyQoL35422', 'oshiyasu229196'];
if (!Array.isArray(data.accounts) || data.accounts.length !== expected.length) throw Error('Exactly three accounts are required');
for (const handle of expected) {
  const matches = data.accounts.filter(a => a.handle === handle);
  if (matches.length !== 1) throw Error('Missing or duplicate account: ' + handle);
  const account = matches[0];
  if (typeof account.name !== 'string' || !account.name || typeof account.sample !== 'boolean' || !Array.isArray(account.posts)) throw Error('Invalid account: ' + handle);
  const ids = new Set();
  for (const p of account.posts) {
    if (typeof p.id !== 'string' || !p.id || ids.has(p.id) || typeof p.handle !== 'string' || typeof p.text !== 'string' || typeof (p.author ?? p.name) !== 'string') throw Error('Invalid or duplicate post: ' + handle);
    ids.add(p.id);
  }
}
// Escape HTML-sensitive characters so post text can never terminate the script element.
const escaped = JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const path = fileURLToPath(new URL('foryou.html', root));
const html = readFileSync(path, 'utf8');
const marker = /(<script type="application\/json" id="foryou-data">)[\s\S]*?(<\/script>)/;
if (!marker.test(html)) throw Error('Embedded data marker missing');
const result = html.replace(marker, (_, start, end) => start + escaped + end);
if (process.argv.includes('--check')) {
  if (result !== html) throw Error('Embedded data is stale. Run node scripts/build-foryou.mjs');
  console.log('For You data validated; embedded data is up to date.');
} else {
  writeFileSync(path, result);
  console.log('Updated foryou.html with data for ' + data.accounts.length + ' accounts.');
}
