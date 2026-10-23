import { readdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeJson } from './build-foryou.mjs';

// 公開の X API v2 レスポンス（ユーザー投稿・キーワード検索）から
// AI Top100 の data-meta.json / data-part*.json と、ページが読む board-data を作る。
// ログイン済みブラウザや For You の取得は使わない。

export const PART_SIZE = 25;
export const BOARD_LIMIT = 100;
export const PER_ACCOUNT_CAP = 4;
export const PAGE_SIZE = 50;

// 公式アカウントは本文が AI 語に当たらなくても残す（製品名・ラボ名だけの投稿がある）。
export const PASS_OFFICIAL = new Set([
  'OpenAI', 'OpenAIDevs', 'AnthropicAI', 'claudeai', 'ClaudeDevs', 'GoogleDeepMind', 'GoogleAIStudio',
  'GeminiApp', 'xai', 'grok', 'perplexity_ai', 'deepseek_ai', 'Alibaba_Qwen', 'AIatMeta', 'MistralAI',
  'cursor_ai', 'ArtificialAnlys', 'ai_database',
]);
// カテゴリ判定の公式集合。nvidia はフィルタは通さないが、残った投稿は発表/研究所に入れる。
export const CATEGORY_OFFICIAL = new Set([
  'OpenAI', 'OpenAIDevs', 'AnthropicAI', 'claudeai', 'ClaudeDevs', 'GoogleDeepMind', 'GoogleAIStudio',
  'GeminiApp', 'xai', 'grok', 'perplexity_ai', 'deepseek_ai', 'Alibaba_Qwen', 'AIatMeta', 'MistralAI',
  'cursor_ai', 'nvidia',
]);
export const LAB_PEOPLE = new Set([
  'sama', 'elonmusk', 'finkd', 'sundarpichai', 'demishassabis', 'gdb', 'DarioAmodei', 'merettm',
  'OfficialLoganK', 'AravSrinivas', 'tszzl', 'satyanadella', 'ylecun', 'karpathy', '_LuoFuli',
]);
export const SPAM_HANDLES = new Set([
  'petri251201', 'GD_818loveyou', 'Bilbeni5', 'WayLimX', 'e_etini', 'SparkyMark96', 'abcwayne', 'lucidforge88',
]);
// 収集時に目視で外した投稿（政治、AskTaxGPT に一致した株リスト）。次回更新で見直す。
export const MANUAL_EXCLUDE = new Set(['2112015643126165669', '2112035832857002481']);

const AI_CS = /(?<![A-Za-z])(?:AIs?|A\.I\.|AGI|ASI|SI|LLMs?|GPT[-\w]*|ML|GPUs?|NVIDIA|Nvidia)(?![A-Za-z])/u;
const AI_RE = /(?:OpenAI|ChatGPT|Anthropic|Claude|Gemini|Grok|xAI|DeepMind|Codex|\bagents?\b|agentic|Cursor|Copilot|Llama|Qwen|DeepSeek|Mistral|neural|inference|\bcompute\b|data ?cent(?:er|re)s?|\bmodels?\b|benchmark|superintelligen|Optimus|robot|\bMuse\b|Perplexity|Colossus|\btokens?\b|\bprompt|machine learning|Hugging ?Face|pretrain|chain-of-thought|生成AI|人工知能|エージェント|モデル|プロンプト|機械学習)/iu;
const LAUNCH = /(?:\bnow\b|\bnew\b|plugin|available|launch|releas|introduc|rolling out|is here|now in|now live|generally available|open[- ]?sourc|we.re (?:shipping|opening|expanding|committing)|new on|announc|today|公開|発表|リリース|提供開始)/iu;
const EVAL_RE = /(?:benchmark|score|eval|SoTA|leaderboard|record|safety|align|risk|regulat|policy|ARR|bubble|distillation|attack|vulnerab|ベンチマーク|スコア|性能|評価|安全)/iu;
const JEV_RE = /\bjev\b/iu;
const URL_ONLY = /^\s*https:\/\/t\.co\/\w+\s*$/u;
const TRAILING_TCO = /\s*https:\/\/t\.co\/\w+\s*$/u;

const BOARD_KEYS = ['rank', 'handle', 'url', 'id', 'views', 'likes', 'metric', 'category', 'snippet', 'name', 'avatar', 'media', 'text', 'snippet_ja'];
const HTML_FILES = ['index.html', 'index.slim.html'];

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function formatMetric(n) {
  const value = Number(n);
  if (!Number.isFinite(value)) throw new Error('metric is not a finite number');
  for (const [div, suffix] of [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']]) {
    if (value >= div) {
      const scaled = value / div;
      return (scaled >= 10 ? scaled.toFixed(0) : scaled.toFixed(1)) + suffix;
    }
  }
  return String(value);
}

export function snippetOf(text) {
  const collapsed = String(text).replace(/\s+/gu, ' ').trim();
  const chars = Array.from(collapsed);
  if (chars.length <= 140) return collapsed;
  return chars.slice(0, 140).join('') + '…';
}

export function categoryOf(handle, text) {
  const body = String(text ?? '');
  if (JEV_RE.test(body)) return 'jev';
  if (CATEGORY_OFFICIAL.has(handle) && LAUNCH.test(body)) return '発表';
  if (EVAL_RE.test(body)) return '評価';
  if (CATEGORY_OFFICIAL.has(handle) || LAB_PEOPLE.has(handle)) return '研究所';
  return 'その他';
}

function decodeEntities(text) {
  return text.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>');
}

function rawText(post) {
  const note = isObject(post.note_tweet) ? post.note_tweet.text : '';
  const text = (typeof note === 'string' && note) || (typeof post.text === 'string' ? post.text : '');
  return decodeEntities(text);
}

function compareName(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function ingestResponses(responses) {
  const posts = new Map();
  const users = new Map();
  const media = new Map();
  for (const { body } of responses) {
    if (!isObject(body) || !Array.isArray(body.data)) continue;
    const includes = isObject(body.includes) ? body.includes : {};
    if (Array.isArray(includes.users)) {
      for (const user of includes.users) if (isObject(user) && user.id != null) users.set(user.id, user);
    }
    if (Array.isArray(includes.media)) {
      for (const item of includes.media) if (isObject(item) && item.media_key) media.set(item.media_key, item);
    }
    for (const post of body.data) {
      if (!isObject(post) || !isObject(post.public_metrics) || post.author_id == null || post.id == null) continue;
      if (!posts.has(post.id)) posts.set(String(post.id), post);
    }
  }
  return { posts, users, media };
}

function pickMedia(post, media) {
  const keys = isObject(post.attachments) && Array.isArray(post.attachments.media_keys) ? post.attachments.media_keys : [];
  for (const key of keys) {
    const item = media.get(key) || {};
    const url = item.url || item.preview_image_url;
    if (url) return url;
  }
  return null;
}

function referenceTypes(post) {
  const refs = Array.isArray(post.referenced_tweets) ? post.referenced_tweets : [];
  return new Set(refs.filter(isObject).map(ref => ref.type));
}

export function buildCandidates(ingested) {
  const candidates = [];
  for (const post of ingested.posts.values()) {
    const refs = referenceTypes(post);
    if (refs.has('replied_to') || refs.has('retweeted')) continue;
    const user = ingested.users.get(post.author_id) || {};
    const handle = typeof user.username === 'string' ? user.username : '';
    const text = rawText(post);
    if (!PASS_OFFICIAL.has(handle) && !(AI_RE.test(text) || AI_CS.test(text))) continue;
    if (!text.trim() || URL_ONLY.test(text)) continue;
    if (SPAM_HANDLES.has(handle)) continue;
    const metrics = post.public_metrics;
    const views = metrics.impression_count || 0;
    const likes = metrics.like_count || 0;
    let avatar = typeof user.profile_image_url === 'string' ? user.profile_image_url : null;
    if (avatar) avatar = avatar.replaceAll('_normal.', '_200x200.');
    candidates.push({
      handle,
      url: `https://x.com/${handle}/status/${post.id}`,
      id: String(post.id),
      views,
      likes,
      metric: formatMetric(views || likes),
      name: typeof user.name === 'string' && user.name ? user.name : handle,
      avatar,
      media: pickMedia(post, ingested.media),
      text: text.replace(TRAILING_TCO, '').trim(),
      lang: typeof post.lang === 'string' ? post.lang : null,
      isQuote: refs.has('quoted'),
    });
  }
  candidates.sort((a, b) => b.views - a.views || b.likes - a.likes);
  return candidates;
}

export function selectRanked(candidates, { limit = BOARD_LIMIT, cap = PER_ACCOUNT_CAP, exclude = MANUAL_EXCLUDE } = {}) {
  const counts = new Map();
  const selected = [];
  for (const item of candidates) {
    if (exclude.has(item.id)) continue;
    const seen = counts.get(item.handle) || 0;
    if (seen >= cap) continue;
    counts.set(item.handle, seen + 1);
    selected.push(item);
    if (selected.length >= limit) break;
  }
  return selected;
}

export function applyTranslations(selected, translations = {}) {
  return selected.map((item, index) => {
    const snippet = snippetOf(item.text);
    let snippetJa = null;
    if (Object.prototype.hasOwnProperty.call(translations, item.id)) snippetJa = translations[item.id];
    else if (item.lang === 'ja') snippetJa = snippet;
    const row = {
      rank: index + 1,
      handle: item.handle,
      url: item.url,
      id: item.id,
      views: item.views,
      likes: item.likes,
      metric: item.metric,
      category: categoryOf(item.handle, item.text),
      snippet,
      name: item.name,
      avatar: item.avatar,
      media: item.media,
      text: item.text,
      snippet_ja: snippetJa,
    };
    return Object.fromEntries(BOARD_KEYS.map(key => [key, row[key]]));
  });
}

export function boardMeta(posts, updatedLabel) {
  return {
    title: 'AI情報 Top 100',
    title_en: 'AI News Top 100',
    title_ja: 'AI情報 Top 100',
    updated_label: updatedLabel,
    pill_en: 'Top 100',
    pill_ja: 'Top 100',
    target: BOARD_LIMIT,
    seeded: posts.length,
    page_size: PAGE_SIZE,
    pages: Math.max(1, Math.ceil(posts.length / PAGE_SIZE)),
  };
}

export function splitParts(posts, partSize = PART_SIZE) {
  const parts = [];
  for (let i = 0; i < posts.length; i += partSize) parts.push(posts.slice(i, i + partSize));
  return parts;
}

// Python json.dumps(..., ensure_ascii=False) と同じ空白。文字列のエスケープは JSON.stringify に任せる。
export function dumps(value) {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(dumps).join(', ')}]`;
  if (isObject(value)) return `{${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${dumps(item)}`).join(', ')}}`;
  throw new Error('unsupported JSON value');
}

export function boardDocument(meta, posts) {
  return { ...meta, posts };
}

export function embedBoard(html, board) {
  const marker = /(<script\b[^>]*\bid=["']board-data["'][^>]*>)[\s\S]*?(<\/script>)/;
  if (!marker.test(html)) throw new Error('board-data marker missing');
  return html.replace(marker, (_, start, end) => `${start}${escapeJson(board)}${end}`);
}

export function loadResponses(dir) {
  const names = readdirSync(dir).filter(name => name.endsWith('.json')).sort(compareName);
  return names.map(name => {
    try {
      return { name, body: JSON.parse(readFileSync(join(dir, name), 'utf8')) };
    } catch (error) {
      throw new Error(`${name}: JSON: ${error.message}`);
    }
  });
}

export function readTranslations(path) {
  if (!path) return {};
  let data;
  try { data = JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) { throw new Error(`${path}: JSON: ${error.message}`); }
  if (!isObject(data)) throw new Error(`${path}: translations must be an object of id -> Japanese text`);
  for (const [id, value] of Object.entries(data)) {
    if (!/^\d+$/.test(id) || typeof value !== 'string' || !value.trim()) throw new Error(`${path}: invalid translation for ${id}`);
  }
  return data;
}

export function buildTop100(responses, { translations = {}, updatedLabel, limit = BOARD_LIMIT, cap = PER_ACCOUNT_CAP, exclude = MANUAL_EXCLUDE } = {}) {
  if (!updatedLabel) throw new Error('updated label is required');
  const candidates = buildCandidates(ingestResponses(responses));
  const posts = applyTranslations(selectRanked(candidates, { limit, cap, exclude }), translations);
  if (!posts.length) throw new Error('no posts left after filtering');
  const meta = boardMeta(posts, updatedLabel);
  return { meta, posts, parts: splitParts(posts), candidates: candidates.length };
}

export function writeTop100(dir, result) {
  writeFileSync(join(dir, 'data-meta.json'), dumps(result.meta));
  result.parts.forEach((part, index) => writeFileSync(join(dir, `data-part${index + 1}.json`), dumps(part)));
  for (const name of readdirSync(dir)) {
    const match = /^data-part(\d+)\.json$/.exec(name);
    if (match && Number(match[1]) > result.parts.length) unlinkSync(join(dir, name));
  }
  const board = boardDocument(result.meta, result.posts);
  const updated = [];
  for (const name of HTML_FILES) {
    const path = join(dir, name);
    if (!existsSync(path)) continue;
    writeFileSync(path, embedBoard(readFileSync(path, 'utf8'), board));
    updated.push(name);
  }
  return updated;
}

export function updatedLabelFromDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('--updated must be YYYY-MM-DD (JST collection date)');
  const [year, month, day] = value.split('-').map(Number);
  const max = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > max) throw new Error('--updated must be a real calendar date');
  return `${value} 更新`;
}

export function parseArgs(argv) {
  const options = { raw: '', translations: '', out: '', updated: '', dryRun: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      i += 1;
      return value;
    };
    if (arg === '--raw') options.raw = next();
    else if (arg === '--translations') options.translations = next();
    else if (arg === '--out') options.out = next();
    else if (arg === '--updated') options.updated = next();
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help') options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

export function helpText() {
  return `Usage: node scripts/build-top100.mjs --raw DIR --updated YYYY-MM-DD [--translations FILE] [--out DIR] [--dry-run] [--help]
公開 X API v2 のレスポンス JSON が入ったディレクトリから AI Top100 を作ります。
--raw DIR            レスポンスファイル（*.json）のディレクトリ。名前順に読みます
--updated YYYY-MM-DD 収集日（JST）。updated_label は「YYYY-MM-DD 更新」になります
--translations FILE  {"投稿ID": "日本語のsnippet"} 。無いIDは lang=ja なら snippet、それ以外は null
--out DIR            出力先（既定: リポジトリ直下）。data-meta.json と data-part*.json を書き、
                     index.html / index.slim.html があれば board-data も差し替えます
--dry-run            保存せず件数だけ表示
ログイン済みブラウザでの取得やスクレイピングは行いません。`;
}

export function main(argv = process.argv.slice(2), root = fileURLToPath(new URL('..', import.meta.url))) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(helpText());
    return;
  }
  if (!options.raw) throw new Error('--raw is required');
  const updatedLabel = options.updated ? updatedLabelFromDate(options.updated) : '';
  if (!options.dryRun && !updatedLabel) throw new Error('--updated is required');
  const responses = loadResponses(resolve(options.raw));
  if (!responses.length) throw new Error(`no JSON files in ${options.raw}`);
  const result = buildTop100(responses, {
    translations: readTranslations(options.translations ? resolve(options.translations) : ''),
    updatedLabel: updatedLabel || 'dry-run',
  });
  const missingJa = result.posts.filter(post => !post.snippet_ja).length;
  console.log(`candidates ${result.candidates}; board ${result.posts.length}; parts ${result.parts.length}; snippet_ja missing ${missingJa}`);
  if (options.dryRun) return result;
  const out = resolve(options.out || root);
  const html = writeTop100(out, result);
  console.log(`wrote data-meta.json and ${result.parts.length} part file(s)${html.length ? `; embedded ${html.join(', ')}` : ''}`);
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
