import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function validateData(data) {
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
}

export function validateBuzz(buzz, data, warn = console.warn) {
  if (!buzz || typeof buzz !== 'object' || Array.isArray(buzz)) throw Error('Invalid buzz data object');
  const ids = new Set(data.accounts.flatMap(a => a.posts.map(p => p.id)));
  for (const [id, entry] of Object.entries(buzz)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
        !Number.isFinite(entry.score) || entry.score < 0 || entry.score > 100 ||
        typeof entry.badge !== 'string' || !['opus', 'jev', 'local'].includes(entry.source) ||
        (entry.reasonJa !== undefined && (typeof entry.reasonJa !== 'string' || !entry.reasonJa.trim()))) {
      throw Error('Invalid buzz prediction: ' + id);
    }
    if (!ids.has(id)) warn('Warning: stale buzz prediction: ' + id);
  }
}

export function escapeJson(data) {
  return JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

export function embedData(html, data, buzz) {
  for (const [id, value] of [['foryou-data', data], ['buzz-data', buzz]]) {
    const marker = new RegExp('(<script[^>]*\\bid=["\']' + id + '["\'][^>]*>)[\\s\\S]*?(<\\/script>)');
    if (!marker.test(html)) throw Error('Embedded data marker missing' + (id === 'buzz-data' ? ': buzz-data' : ''));
    html = html.replace(marker, (_, start, end) => start + escapeJson(value) + end);
  }
  return html;
}

export function readBuzz(root) {
  const path = new URL('foryou-buzz.json', root);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
}

export function build(root = new URL('../', import.meta.url), check = false) {
  const data = JSON.parse(readFileSync(new URL('foryou-data.json', root), 'utf8'));
  validateData(data);
  const buzz = readBuzz(root);
  validateBuzz(buzz, data);
  const path = fileURLToPath(new URL('foryou.html', root));
  const html = readFileSync(path, 'utf8');
  const result = embedData(html, data, buzz);
  if (check) {
    if (result !== html) throw Error('Embedded data is stale. Run node scripts/build-foryou.mjs');
    console.log('For You data validated; embedded data is up to date for ' + data.accounts.length + ' accounts.');
  } else {
    writeFileSync(path, result);
    console.log('Updated foryou.html with data for ' + data.accounts.length + ' accounts.');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build(undefined, process.argv.includes('--check'));
}
