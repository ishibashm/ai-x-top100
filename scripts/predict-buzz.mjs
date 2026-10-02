import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBuzz, validateData, validateBuzz } from './build-foryou.mjs';

export function badgeForScore(score) {
  return score >= 70 ? '🔥高' : score >= 45 ? '↗中' : '・低';
}

export function scorePost(post, updatedAt) {
  const reasons = [];
  let points = 0;
  const metric = name => {
    const value = post.metrics?.[name] ?? post[name];
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
  };
  const views = metric('views');
  const likes = metric('likes');
  const count = n => n >= 10000 ? (n / 10000).toFixed(1) + '万' : String(Math.round(n));
  // 表示40点・いいね25点・率15点・本文8点・メディア7点・鮮度5点。
  if (views !== undefined) {
    points += Math.min(40, Math.log10(views + 1) * 8);
    reasons.push(count(views) + '表示');
  }
  if (likes !== undefined) {
    points += Math.min(25, Math.log10(likes + 1) * 6.25);
    reasons.push(count(likes) + 'いいね');
  }
  if (views > 0 && likes !== undefined) {
    const rate = Math.min(1, likes / views);
    points += Math.min(15, rate * 300);
    reasons.push('いいね率' + (rate * 100).toFixed(1) + '%');
  }
  const length = Array.from(post.text ?? '').length;
  if (length) {
    points += Math.min(8, length / 25);
    reasons.push('本文' + length + '字');
  }
  if ((typeof post.media === 'string' && post.media.trim()) || (Array.isArray(post.media) && post.media.length)) {
    points += 7;
    reasons.push('メディアあり');
  }
  // タイムゾーンを持つ日時だけを利用し、実行環境の時刻・TZに依存させません。
  const timestamp = value => typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? Date.parse(value) : NaN;
  const elapsed = (timestamp(updatedAt) - timestamp(post.createdAt)) / 3600000;
  if (Number.isFinite(elapsed) && elapsed >= 0) {
    points += 5 / (1 + elapsed / 24);
    reasons.push('取得時' + Math.round(elapsed) + '時間経過');
  }
  // 保存済みopus/jev 50件の平均差11.90点を固定12点で補正します。
  const score = Math.max(0, Math.min(100, Math.round(points) - 12));
  return { score, badge: badgeForScore(score), source: 'local', reasonJa: reasons.join('・') || '利用可能な特徴量なし' };
}

export function predictBuzz(data, existing, { account, prune = false } = {}) {
  if (account !== undefined && !data.accounts.some(a => a.handle === account)) throw Error('Unknown account: ' + account);
  const buzz = { ...existing };
  const ids = new Set(data.accounts.flatMap(a => a.posts.map(p => p.id)));
  let removed = 0;
  if (prune) {
    for (const id of Object.keys(buzz)) {
      if (!ids.has(id)) { delete buzz[id]; removed++; }
    }
  }
  const seen = new Set();
  let added = 0;
  let recalculated = 0;
  let preserved = 0;
  for (const a of data.accounts) {
    if (account !== undefined && a.handle !== account) continue;
    for (const post of a.posts) {
      if (seen.has(post.id)) continue;
      seen.add(post.id);
      if (Object.hasOwn(buzz, post.id) && ['opus', 'jev'].includes(buzz[post.id].source)) {
        preserved++;
        continue;
      }
      if (Object.hasOwn(buzz, post.id)) recalculated++;
      else added++;
      Object.defineProperty(buzz, post.id, { value: scorePost(post, a.updatedAt), enumerable: true, configurable: true, writable: true });
    }
  }
  return { buzz, added, recalculated, preserved, removed };
}

// 同順位には平均順位を割り当て、順位のPearson相関を求めます。
export function spearman(xs, ys) {
  const ranks = values => {
    const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
    const result = [];
    for (let i = 0; i < sorted.length;) {
      let end = i + 1;
      while (end < sorted.length && sorted[end].value === sorted[i].value) end++;
      for (let j = i; j < end; j++) result[sorted[j].index] = (i + end - 1) / 2;
      i = end;
    }
    return result;
  };
  if (xs.length !== ys.length) throw Error('Rank inputs must have equal lengths');
  const x = ranks(xs), y = ranks(ys), mean = (x.length - 1) / 2;
  let covariance = 0, varianceX = 0, varianceY = 0;
  for (let i = 0; i < x.length; i++) {
    const dx = x[i] - mean, dy = y[i] - mean;
    covariance += dx * dy;
    varianceX += dx * dx;
    varianceY += dy * dy;
  }
  return varianceX && varianceY ? covariance / Math.sqrt(varianceX * varianceY) : null;
}

export function calibrate(data, existing, { account } = {}) {
  if (account !== undefined && !data.accounts.some(a => a.handle === account)) throw Error('Unknown account: ' + account);
  const model = [], local = [], seen = new Set();
  for (const a of data.accounts) {
    if (account !== undefined && a.handle !== account) continue;
    for (const post of a.posts) {
      if (seen.has(post.id)) continue;
      seen.add(post.id);
      if (!['opus', 'jev'].includes(existing[post.id]?.source)) continue;
      model.push(existing[post.id].score);
      local.push(scorePost(post, a.updatedAt).score);
    }
  }
  const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const badges = values => Object.fromEntries(['🔥高', '↗中', '・低'].map(badge => [badge, values.filter(score => badgeForScore(score) === badge).length]));
  return {
    count: model.length,
    modelMean: average(model), localMean: average(local),
    meanAbsoluteError: average(local.map((score, i) => Math.abs(score - model[i]))),
    spearman: spearman(model, local),
    modelBadges: badges(model), localBadges: badges(local)
  };
}

export function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--account') {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw Error('--account requires a handle');
      options.account = args[++i];
    } else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--calibrate') options.calibrate = true;
    else if (arg === '--prune') options.prune = true;
    else if (arg === '--help') options.help = true;
    else throw Error('Unknown option: ' + arg);
  }
  return options;
}

export function main(args = process.argv.slice(2), root = new URL('../', import.meta.url)) {
  const options = parseArgs(args);
  if (options.help) {
    console.log('Usage: node scripts/predict-buzz.mjs [--account HANDLE] [--dry-run] [--calibrate] [--prune] [--help]\nオフラインでlocal予測を補完・再計算します。opus/jevは保持します。\n--account HANDLE  対象アカウントを限定\n--dry-run         保存せず要約を表示\n--calibrate       opus/jevとlocalの比較統計を表示（書き込みなし）\n--prune           全アカウントから消えた投稿IDを削除');
    return;
  }
  const data = JSON.parse(readFileSync(new URL('foryou-data.json', root), 'utf8'));
  validateData(data);
  const existing = readBuzz(root);
  validateBuzz(existing, data);
  if (options.calibrate) {
    console.log('Calibration (read-only; undefined statistics are null):');
    console.log(JSON.stringify(calibrate(data, existing, options), null, 2));
    return;
  }
  const result = predictBuzz(data, existing, options);
  console.log(`${options.dryRun ? 'Dry run' : 'Predicted'}: added=${result.added}, recalculated=${result.recalculated}, preserved=${result.preserved}, pruned=${result.removed}, total=${Object.keys(result.buzz).length}`);
  if (!options.dryRun) {
    writeFileSync(new URL('foryou-buzz.json', root), JSON.stringify(result.buzz, null, 2) + '\n');
    console.log('Saved foryou-buzz.json. Run node scripts/build-foryou.mjs');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
