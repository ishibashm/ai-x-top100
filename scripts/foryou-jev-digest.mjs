import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('../', import.meta.url));

const TOPIC_DEFS = [
  {
    key: 'jev-usecases',
    label: 'Jev活用・デモ',
    description: 'Jev を判定レイヤーとして組み込み、速度・コスト・体験改善に使う投稿',
    patterns: [
      /\bjev\b/i,
      /ジェヴ|JEV/,
      /computer use|browser-use|context|compaction|compression|判定|分類|仕分け|圧縮|routing|rerank|score|scoring|監査|SEO|ゲーム|chat game|trading|トレーディング|workflows?/i,
    ],
  },
  {
    key: 'jev-platform',
    label: 'Jevエコシステム・API',
    description: 'Jev の API、SDK、互換実装、料金、公開状況に関する投稿',
    patterns: [
      /\bjev\b/i,
      /api|sdk|gateway|typesafe|system one|early access|waitlist|無料開放|互換|ローカル|open source|opensource|github/i,
    ],
  },
  {
    key: 'agents-devtools',
    label: 'エージェント・開発ツール',
    description: 'Codex、Claude Code、MCP、Cursor、Devin などの開発支援やエージェント運用の投稿',
    patterns: [
      /codex|claude code|claude cowork|cursor|mcp|agent|agents|devin|tool|plugin|skills|code scans|project instructions/i,
      /エージェント|開発ツール|プラグイン|スキル/,
    ],
  },
  {
    key: 'media-creation',
    label: '画像・動画・クリエイティブ',
    description: '画像生成、動画生成、音声、3D などのクリエイティブ制作に関する投稿',
    patterns: [
      /gpt image|image|video|music|canvas|3d|blender|audio|speech|voice|lyria|pov/i,
      /画像|動画|音声|衣装|キャラ|3D|生成/,
    ],
  },
  {
    key: 'model-launches',
    label: 'モデル発表・製品更新',
    description: 'モデル公開、性能アップデート、ベンチマーク公開に関する投稿',
    patterns: [
      /gpt|claude|gemini|openai|anthropic|perplexity|google|mimo|astra|release|available|launch|framework|benchmark|eval/i,
      /発表|公開|提供開始|ベンチ|モデル|評価|アップデート/,
    ],
  },
  {
    key: 'safety-policy',
    label: '安全性・政策',
    description: 'AI 安全性、アラインメント、規制、フロンティアの減速などの投稿',
    patterns: [
      /safety|alignment|misalignment|frontier|pace|slow down|regulation|risk|auditor|evaluators?/i,
      /安全|アラインメント|規制|減速|フロンティア|監査|評価者|リスク/,
    ],
  },
  {
    key: 'market-analysis',
    label: '市場・事業論評',
    description: '市場評価、事業機会、導入余地、業界インパクトに関する投稿',
    patterns: [
      /business|market|marketing|lead|revenue|enterprise|customer|industry|economi|sales|pricing/i,
      /事業|市場|収益|営業|顧客|導入|ビジネス|マーケティング/,
    ],
  },
];

const FORMAT_DEFS = [
  { key: 'explainer', label: '解説・まとめ', patterns: [/まとめ|解説|基礎知識|初心者|3分|40秒|整理|deep dive|guide/i] },
  { key: 'demo', label: '実演・作例', patterns: [/作りました|作ってみた|デモ|動画|やってみた|比較|公開|experiment|built|demo/i] },
  { key: 'release', label: '発表・リリース', patterns: [/available|release|launch|is now|提供開始|公開|発表|free|waitlist/i] },
  { key: 'workflow', label: '運用ノウハウ', patterns: [/使い方|活用|手順|プロンプト|workflow|how to|tips|監査|導入|routing|score/i] },
  { key: 'opinion', label: '所感・論評', patterns: [/思う|やばい|すごい|wrong|agree|believe|warn|懸念|朗報|衝撃|話題/i] },
];

const TONE_DEFS = [
  { key: 'bullish', label: '強気', patterns: [/革命|game changer|最速|爆誕|insane|ヤバい|凄い|衝撃|最高|ぶっ飛ん|viral/i] },
  { key: 'practical', label: '実務', patterns: [/導入|運用|use case|workflow|分類|評価|routing|cost|速度|業務|enterprise/i] },
  { key: 'cautious', label: '慎重', patterns: [/risk|safety|wrong|懸念|危険|疑義|slow down|規制|alignment/i] },
  { key: 'playful', label: '軽い', patterns: [/lol|wow|てくてく|やばい|置いとく|interview|potatoes/i] },
];

const WORD_BONUS = [
  { pattern: /\bjev\b|JEV|ジェヴ/, boost: 1.8 },
  { pattern: /codex|claude code|cursor|mcp|agent/i, boost: 1.2 },
  { pattern: /gpt image|image|video|audio|3d|blender/i, boost: 0.8 },
  { pattern: /safety|alignment|regulation|risk|規制|安全|アラインメント/i, boost: 0.9 },
];

const AI_MARKER_PATTERN = /\b(ai|agent|agents|model|models|llm|codex|cursor|claude|openai|anthropic|gemini|mcp|jev|typesafe|astra|prompt|workflow)\b|AI|エージェント|モデル|生成|分類|判定|ツール|開発/i;

function parseArgs(argv) {
  const options = {
    dryRun: false,
    input: resolve(rootDir, 'foryou-data.json'),
    outputDir: resolve(rootDir, 'drafts'),
    date: null,
    sidecar: true,
    limit: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--no-json') {
      options.sidecar = false;
    } else if (arg === '--input') {
      options.input = resolve(process.cwd(), argv[index + 1]);
      index += 1;
    } else if (arg === '--output-dir') {
      options.outputDir = resolve(process.cwd(), argv[index + 1]);
      index += 1;
    } else if (arg === '--date') {
      options.date = argv[index + 1];
      index += 1;
    } else if (arg === '--limit') {
      options.limit = Number(argv[index + 1]);
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.limit !== null && (!Number.isFinite(options.limit) || options.limit < 1)) {
    throw new Error('--limit must be a positive number');
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/foryou-jev-digest.mjs [--dry-run] [--input path] [--output-dir path] [--date YYYYMMDD] [--limit N] [--no-json]

Notes:
  --dry-run   mock分類を強制し、ローカル出力のみ行います
  --input     既定は foryou-data.json
  --output-dir 既定は drafts/
  --date      出力ファイル日付を固定
  --limit     先頭 N 件の投稿だけを使って試す
  --no-json   JSON sidecar を出力しません`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function formatDateStamp(override, accounts) {
  if (override) return override;
  const updatedTimes = accounts
    .map(account => Date.parse(account.updatedAt ?? ''))
    .filter(value => Number.isFinite(value));
  const sourceDate = updatedTimes.length ? new Date(Math.max(...updatedTimes)) : new Date();
  return sourceDate.toISOString().slice(0, 10).replaceAll('-', '');
}

function normalizeAccounts(raw, limit) {
  if (!raw || !Array.isArray(raw.accounts)) {
    throw new Error('Input must contain an accounts array');
  }

  let serial = 0;
  const posts = [];
  const accounts = raw.accounts.map(account => {
    const normalizedPosts = Array.isArray(account.posts)
      ? account.posts.map(post => normalizePost(account, post, serial += 1))
      : [];
    posts.push(...normalizedPosts);
    return {
      name: account.name,
      handle: account.handle,
      sample: Boolean(account.sample),
      updatedAt: account.updatedAt ?? null,
      posts: normalizedPosts,
    };
  });

  const limitedPosts = limit === null ? posts : posts.slice(0, limit);
  const keptIds = new Set(limitedPosts.map(post => post.internalId));
  const limitedAccounts = accounts.map(account => ({
    ...account,
    posts: account.posts.filter(post => keptIds.has(post.internalId)),
  })).filter(account => account.posts.length > 0);

  return {
    accounts: limitedAccounts,
    posts: limitedPosts,
  };
}

function normalizePost(account, post, serial) {
  const text = String(post.text ?? post.snippet ?? '').trim();
  const textJa = typeof post.textJa === 'string'
    ? post.textJa.trim()
    : typeof post.snippet_ja === 'string'
      ? post.snippet_ja.trim()
      : '';
  const views = pickMetric(post, ['views', 'metrics.views']);
  const likes = pickMetric(post, ['likes', 'metrics.likes']);
  const displayText = textJa || text;
  const snippet = firstSentence(displayText, 120);

  return {
    internalId: `${account.handle}-${post.id ?? serial}`,
    accountName: account.name,
    accountHandle: account.handle,
    id: String(post.id ?? serial),
    author: String(post.author ?? post.name ?? account.name ?? account.handle),
    handle: String(post.handle ?? ''),
    text,
    textJa,
    displayText,
    snippet,
    url: typeof post.url === 'string' ? post.url : '',
    createdAt: typeof post.createdAt === 'string' ? post.createdAt : null,
    updatedAt: typeof account.updatedAt === 'string' ? account.updatedAt : null,
    lang: typeof post.lang === 'string' ? post.lang : detectLang(displayText),
    views,
    likes,
    media: typeof post.media === 'string' ? post.media : '',
    raw: post,
  };
}

function pickMetric(object, paths) {
  for (const path of paths) {
    const value = path.split('.').reduce((memo, key) => (memo && memo[key] !== undefined ? memo[key] : undefined), object);
    if (Number.isFinite(value)) return Number(value);
  }
  return 0;
}

function detectLang(text) {
  if (/[\u3040-\u30ff]/.test(text)) return 'ja';
  if (/[\u4e00-\u9fff]/.test(text)) return 'zh-or-ja';
  if (/[a-z]/i.test(text)) return 'en';
  return 'unknown';
}

function firstSentence(text, maxLength = 100) {
  const compact = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!compact) return '(本文なし)';
  const boundary = compact.split(/(?<=[。！？!?])|\n+/)[0] || compact;
  return boundary.length > maxLength ? `${boundary.slice(0, maxLength - 1)}…` : boundary;
}

function scoreByPatterns(text, definitions, fallbackKey, fallbackLabel) {
  const counts = definitions
    .map(definition => ({
      key: definition.key,
      label: definition.label,
      score: definition.patterns.reduce((total, pattern) => total + (pattern.test(text) ? 1 : 0), 0),
    }))
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label, 'ja'));

  const top = counts[0];
  if (!top || top.score === 0) {
    return { key: fallbackKey, label: fallbackLabel, scores: counts };
  }
  return { key: top.key, label: top.label, scores: counts };
}

function classifyMock(post) {
  const text = `${post.displayText}\n${post.text}`.toLowerCase();
  const topic = scoreByPatterns(text, TOPIC_DEFS, 'misc', 'その他');
  const format = scoreByPatterns(text, FORMAT_DEFS, 'note', '短文メモ');
  const tone = scoreByPatterns(text, TONE_DEFS, 'neutral', '中立');

  const keywordMatches = [];
  for (const definition of TOPIC_DEFS) {
    const matches = definition.patterns.filter(pattern => pattern.test(text)).length;
    if (matches > 0) keywordMatches.push({ key: definition.key, label: definition.label, matches });
  }

  const tags = keywordMatches
    .sort((left, right) => right.matches - left.matches || left.label.localeCompare(right.label, 'ja'))
    .slice(0, 3)
    .map(item => item.label);

  const baseScore = engagementScore(post);
  const keywordBoost = WORD_BONUS.reduce((total, rule) => total + (rule.pattern.test(post.displayText) ? rule.boost : 0), 0);
  const aiBoost = AI_MARKER_PATTERN.test(post.displayText) ? 1.6 : 0;
  const topicAdjustment = topic.key === 'misc' ? -3.2 : 1.4;

  return {
    classifier: 'mock',
    primaryTopicKey: topic.key,
    primaryTopicLabel: topic.label,
    formatKey: format.key,
    formatLabel: format.label,
    toneKey: tone.key,
    toneLabel: tone.label,
    tags: tags.length ? tags : ['その他'],
    confidence: computeConfidence(topic.scores),
    digestScore: Number((baseScore + keywordBoost + aiBoost + topicAdjustment).toFixed(2)),
  };
}

async function classifyWithJev(post) {
  const response = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.TYPESAFE_MODEL || 'jev-latest',
      state: {
        account_name: post.accountName,
        account_handle: post.accountHandle,
        author: post.author,
        author_handle: post.handle,
        text: post.text,
        text_ja: post.textJa || null,
        metrics: { views: post.views, likes: post.likes },
        created_at: post.createdAt,
      },
      questions: {
        primary_topic: {
          type: 'choice',
          instructions: 'Choose the main editorial bucket for this social post.',
          criteria: Object.fromEntries(TOPIC_DEFS.map(definition => [definition.key, definition.description])),
        },
        post_format: {
          type: 'choice',
          instructions: 'Choose the shape of this post.',
          criteria: {
            explainer: 'Educational explanation, summary, or walkthrough',
            demo: 'Concrete demo, build log, experiment, or showcase',
            release: 'Launch, release, new availability, or announcement',
            workflow: 'Operational tip, implementation pattern, or practical tactic',
            opinion: 'Reaction, commentary, hot take, or personal viewpoint',
          },
        },
        tone: {
          type: 'choice',
          instructions: 'Choose the editorial tone of the post.',
          criteria: {
            bullish: 'Hyped, enthusiastic, strongly positive',
            practical: 'Applied, operational, implementation-focused',
            cautious: 'Risk-aware, skeptical, or warning-oriented',
            playful: 'Light, humorous, meme-like, casual',
            neutral: 'Primarily descriptive or balanced',
          },
        },
        editorial_priority: {
          type: 'choice',
          instructions: 'How strategically useful is this post for a Japanese AI digest?',
          criteria: {
            low: 'Little signal, mostly noise or generic banter',
            medium: 'Interesting but narrow signal',
            high: 'Useful example or clear market signal',
            lead: 'Top-tier signal worth leading the digest',
          },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Jev API returned ${response.status}`);
  }

  const payload = await response.json();
  const primary = payload.primary_topic ?? payload.answers?.primary_topic;
  const postFormat = payload.post_format ?? payload.answers?.post_format;
  const tone = payload.tone ?? payload.answers?.tone;
  const strategic = payload.editorial_priority ?? payload.answers?.editorial_priority;

  if (!primary?.choice || !postFormat?.choice || !tone?.choice) {
    throw new Error('Jev API response missing expected choices');
  }

  const topicLabel = TOPIC_DEFS.find(definition => definition.key === primary.choice)?.label ?? primary.choice;
  const formatLabel = FORMAT_DEFS.find(definition => definition.key === postFormat.choice)?.label ?? postFormat.choice;
  const toneLabel = TONE_DEFS.find(definition => definition.key === tone.choice)?.label ?? tone.choice;

  const tags = [topicLabel, formatLabel, toneLabel];
  const strategicScoreMap = { low: 1.5, medium: 2.6, high: 3.8, lead: 5 };
  const strategicScore = strategicScoreMap[strategic?.choice] ?? 2.6;
  const baseScore = engagementScore(post);
  const aiBoost = AI_MARKER_PATTERN.test(post.displayText) ? 1.6 : 0;
  const topicAdjustment = primary.choice === 'misc' ? -3.2 : 1.4;

  return {
    classifier: 'jev',
    primaryTopicKey: primary.choice,
    primaryTopicLabel: topicLabel,
    formatKey: postFormat.choice,
    formatLabel,
    toneKey: tone.choice,
    toneLabel,
    tags,
    confidence: averageNumbers([primary.confidence, postFormat.confidence, tone.confidence, strategic?.confidence]),
    digestScore: Number((baseScore + strategicScore * 1.5 + aiBoost + topicAdjustment).toFixed(2)),
  };
}

function averageNumbers(values) {
  const filtered = values.filter(value => Number.isFinite(value));
  if (!filtered.length) return 0.5;
  return Number((filtered.reduce((total, value) => total + value, 0) / filtered.length).toFixed(2));
}

function computeConfidence(scores) {
  if (!scores || scores.length < 2) return 0.55;
  const [first, second] = scores;
  const gap = first.score - second.score;
  return Number(Math.max(0.45, Math.min(0.92, 0.55 + gap * 0.12)).toFixed(2));
}

function engagementScore(post) {
  const viewsScore = Math.log10((post.views || 0) + 10);
  const likesScore = Math.log10((post.likes || 0) + 10);
  return Number((viewsScore * 2.2 + likesScore * 1.3).toFixed(2));
}

async function classifyPosts(posts, { dryRun }) {
  const warnings = [];
  const useJev = !dryRun && Boolean(process.env.TYPESAFE_API_KEY);
  const classified = [];

  for (const post of posts) {
    if (!useJev) {
      classified.push({ ...post, classification: classifyMock(post) });
      continue;
    }

    try {
      classified.push({ ...post, classification: await classifyWithJev(post) });
    } catch (error) {
      warnings.push(`Jev fallback for ${post.id}: ${error.message}`);
      classified.push({ ...post, classification: classifyMock(post) });
    }
  }

  return {
    mode: useJev ? 'jev' : 'mock',
    warnings,
    posts: classified,
  };
}

function buildDigest({ accounts, posts, dateStamp, inputPath, classifierMode, warnings }) {
  const accountSummaries = accounts.map(account => summarizeAccount(account, posts));
  const topPosts = dedupePosts(posts)
    .sort((left, right) => right.classification.digestScore - left.classification.digestScore || right.views - left.views)
    .slice(0, 10);
  const clusters = summarizeClusters(posts);
  const editorialClusters = prioritizeClusters(clusters);
  const meta = {
    generatedAt: new Date().toISOString(),
    dateStamp,
    inputFile: basename(inputPath),
    classifierMode,
    accountCount: accounts.length,
    postCount: posts.length,
    warnings,
  };

  const titles = buildTitleCandidates(editorialClusters, topPosts);
  const body = buildBlogDraftBody({ dateStamp, accountSummaries, topPosts, clusters: editorialClusters, meta });

  return { meta, accountSummaries, topPosts, clusters: editorialClusters, allClusters: clusters, titles, body };
}

function summarizeAccount(account, classifiedPosts) {
  const posts = classifiedPosts.filter(post => post.accountHandle === account.handle);
  const topicCounts = countBy(posts, post => post.classification.primaryTopicLabel);
  const formatCounts = countBy(posts, post => post.classification.formatLabel);
  const topTopics = sortedCounts(topicCounts).slice(0, 3);
  const topFormats = sortedCounts(formatCounts).slice(0, 2);
  const topPost = dedupePosts(posts).sort((left, right) => right.classification.digestScore - left.classification.digestScore || right.views - left.views)[0];

  const nonMiscTopic = topTopics.find(item => item.key !== 'その他');
  const leadTopic = nonMiscTopic?.key ?? topTopics[0]?.key;
  const subTopics = topTopics.filter(item => item.key !== leadTopic).slice(0, 2);
  const themeLine = leadTopic
    ? `${account.name} は「${leadTopic}」を中心に、${subTopics.map(item => `「${item.key}」`).join(' と ') || '周辺反応'} が続く構成。`
    : `${account.name} は目立ったテーマ分布をまだ形成していません。`;

  const operationsLine = topFormats.length
    ? `投稿の型は ${topFormats.map(item => `${item.key}(${item.count})`).join('、')} が中心です。`
    : '投稿の型は分散しています。';

  return {
    name: account.name,
    handle: account.handle,
    updatedAt: account.updatedAt,
    postCount: posts.length,
    topTopics,
    topFormats,
    themeLine,
    operationsLine,
    representativePost: topPost ? {
      author: topPost.author,
      url: topPost.url,
      headline: topPost.snippet,
      topic: topPost.classification.primaryTopicLabel,
      digestScore: topPost.classification.digestScore,
    } : null,
  };
}

function summarizeClusters(posts) {
  const buckets = new Map();

  for (const post of posts) {
    const key = post.classification.primaryTopicKey;
    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        label: post.classification.primaryTopicLabel,
        posts: [],
      });
    }
    buckets.get(key).posts.push(post);
  }

  return [...buckets.values()]
    .map(cluster => {
      const sortedPosts = [...cluster.posts].sort((left, right) => right.classification.digestScore - left.classification.digestScore || right.views - left.views);
      const accounts = [...new Set(sortedPosts.map(post => `@${post.accountHandle}`))];
      const views = sortedPosts.reduce((total, post) => total + post.views, 0);
      const likes = sortedPosts.reduce((total, post) => total + post.likes, 0);
      const digestScoreTotal = sortedPosts.reduce((total, post) => total + post.classification.digestScore, 0);
      const tones = sortedCounts(countBy(sortedPosts, post => post.classification.toneLabel)).slice(0, 2).map(item => item.key);
      const formats = sortedCounts(countBy(sortedPosts, post => post.classification.formatLabel)).slice(0, 2).map(item => item.key);
      const representative = dedupePosts(sortedPosts).slice(0, 3).map(post => ({
        author: post.author,
        headline: post.snippet,
        url: post.url,
        accountHandle: post.accountHandle,
        digestScore: post.classification.digestScore,
      }));
      const summary = `${cluster.label} は ${cluster.posts.length} 件。${accounts.length} アカウントにまたがって観測され、トーンは ${tones.join(' / ') || '中立'}、型は ${formats.join(' / ') || '短文メモ'} が中心です。総ビューは約 ${formatCompactNumber(views)}、総いいねは ${formatCompactNumber(likes)}。`;

      return {
        key: cluster.key,
        label: cluster.label,
        postCount: cluster.posts.length,
        accountHandles: accounts,
        totalViews: views,
        totalLikes: likes,
        totalDigestScore: Number(digestScoreTotal.toFixed(2)),
        summary,
        representative,
        editorialAngles: buildEditorialAngles(cluster.label, sortedPosts),
      };
    })
    .sort((left, right) => right.totalDigestScore - left.totalDigestScore || right.postCount - left.postCount || right.totalViews - left.totalViews);
}

function dedupePosts(posts) {
  const seen = new Set();
  const result = [];
  for (const post of posts) {
    const key = post.url || post.id || post.internalId;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(post);
  }
  return result;
}

function prioritizeClusters(clusters) {
  return [...clusters].sort((left, right) => {
    const leftPenalty = left.key === 'misc' ? 1 : 0;
    const rightPenalty = right.key === 'misc' ? 1 : 0;
    return leftPenalty - rightPenalty
      || right.totalDigestScore - left.totalDigestScore
      || right.postCount - left.postCount
      || right.totalViews - left.totalViews;
  });
}

function buildEditorialAngles(label, posts) {
  const authors = [...new Set(posts.slice(0, 6).map(post => post.author))].slice(0, 3);
  const formats = sortedCounts(countBy(posts, post => post.classification.formatLabel)).slice(0, 2).map(item => item.key);
  const accounts = [...new Set(posts.map(post => `@${post.accountHandle}`))].slice(0, 3);

  return [
    `${label} は ${accounts.join('・')} で同時多発的に出ており、単発のバズというより継続テーマとして扱えます。`,
    `${formats.join(' と ') || '複数形式'} が混ざっているため、記事では「何が起きたか」と「どう使われ始めたか」を分けて書くと整理しやすいです。`,
    authors.length ? `代表例としては ${authors.join('、')} の投稿が引用候補です。` : '引用候補はビューと論点の両方で選別してください。',
  ];
}

function buildTitleCandidates(clusters, topPosts) {
  const clusterLead = clusters[0]?.label ?? 'For You';
  const secondLead = clusters[1]?.label ?? 'AI';
  const topSignal = topPosts[0]?.snippet ?? '注目投稿';
  return [
    `【For You Digest】${clusterLead}が主役になった日：関連トピックを一気に整理`,
    `Jev以後のFor Youは何を見ていたか：${clusterLead}と${secondLead}で読む注目投稿`,
    `For Youボード下書き：${topSignal.slice(0, 26)}から広がる今日の論点`,
  ];
}

function buildBlogDraftBody({ dateStamp, topPosts, clusters, meta }) {
  const leadCluster = clusters[0];
  const secondaryCluster = clusters[1];
  const leadPost = topPosts[0];
  const title = `# For You Digest Draft ${dateStamp}`;
  const intro = [
    '> ※このファイルはブログ下書きです。Pages / note / Zenn / Qiita / X への公開・投稿は**手動**で行ってください。',
    '',
    `今回の For You ボードでは、全 ${meta.postCount} 投稿の中で **${leadCluster?.label ?? '主要テーマ'}** が最も大きな波を作っていました。`,
    leadPost ? `特に ${leadPost.author} の投稿「${leadPost.snippet}」は、全体の論点を代表する一本として冒頭引用に使いやすいです。` : '',
    secondaryCluster ? `次点では **${secondaryCluster.label}** が目立ち、単なるニュース列挙ではなく「使い方」と「周辺エコシステム」の両面で流れが見えます。` : '',
  ].filter(Boolean).join('\n');

  const sectionBodies = clusters.slice(0, 4).map((cluster, index) => {
    const example = cluster.representative[0];
    return [
      `## ${index + 1}. ${cluster.label}`,
      cluster.summary,
      '',
      ...cluster.editorialAngles.map(angle => `- ${angle}`),
      '',
      example ? `代表投稿は ${example.author} の「${example.headline}」です。ここを起点に、周辺の投稿を「実装」「事業インパクト」「周辺ツール」の順でつなぐと記事構成が安定します。` : '',
    ].filter(Boolean).join('\n');
  });

  const close = [
    '## まとめ',
    `For You ボードを俯瞰すると、今回は「${leadCluster?.label ?? '主要テーマ'}」を核にしながら、周辺で ${secondaryCluster?.label ?? '関連論点'} が補助線を引く構図でした。`,
    'ブログ化するときは、投稿単体の紹介で終わらせず「どのレイヤーで使われ始めたか」「何が既存フローを置き換えるのか」を一段抽象化して書くと、読後価値が上がります。',
    '',
    '### 編集メモ',
    '- 事実確認は引用元ポストとリンク先で再確認する',
    '- 数値はビュー・いいねのどちらを採用するか記事ごとに統一する',
    '- 公開作業と X 投稿はこの下書きの外で手動実施する',
  ].join('\n');

  return [title, '', intro, '', ...sectionBodies, '', close].join('\n');
}

function renderMarkdown(digest) {
  const lines = [];
  lines.push(`# For You Jev Digest Draft ${digest.meta.dateStamp}`);
  lines.push('');
  lines.push('> このファイルはローカル生成された**下書き**です。Pages / note / Zenn / Qiita / X への公開は行いません。必要に応じて手動で転記・編集してください。');
  lines.push('');
  lines.push('## 1. 生成メタ');
  lines.push('');
  lines.push(`- 生成日時: ${digest.meta.generatedAt}`);
  lines.push(`- 入力: \`${digest.meta.inputFile}\``);
  lines.push(`- 分類モード: \`${digest.meta.classifierMode}\``);
  lines.push(`- 対象アカウント: ${digest.meta.accountCount}`);
  lines.push(`- 対象投稿数: ${digest.meta.postCount}`);
  if (digest.meta.warnings.length) {
    lines.push(`- 警告: ${digest.meta.warnings.length} 件`);
  }
  lines.push('');

  lines.push('## 2. タイトル案');
  lines.push('');
  digest.titles.forEach(title => lines.push(`- ${title}`));
  lines.push('');

  lines.push('## 3. アカウント別テーマ');
  lines.push('');
  for (const account of digest.accountSummaries) {
    lines.push(`### ${account.name} / @${account.handle}`);
    lines.push('');
    lines.push(`- 投稿数: ${account.postCount}`);
    lines.push(`- 主テーマ: ${account.topTopics.map(item => `${item.key}(${item.count})`).join(' / ') || 'なし'}`);
    lines.push(`- 投稿の型: ${account.topFormats.map(item => `${item.key}(${item.count})`).join(' / ') || 'なし'}`);
    lines.push(`- 読み筋: ${account.themeLine} ${account.operationsLine}`);
    if (account.representativePost) {
      lines.push(`- 代表投稿: [${account.representativePost.author}](${account.representativePost.url}) - ${account.representativePost.headline}`);
    }
    lines.push('');
  }

  lines.push('## 4. トップ投稿');
  lines.push('');
  lines.push('| Rank | 投稿 | テーマ | アカウント | 指標 |');
  lines.push('| --- | --- | --- | --- | --- |');
  digest.topPosts.forEach((post, index) => {
    const metric = `${formatCompactNumber(post.views)} views / ${formatCompactNumber(post.likes)} likes`;
    lines.push(`| ${index + 1} | [${escapePipes(post.author)}](${post.url})<br>${escapePipes(post.snippet)} | ${post.classification.primaryTopicLabel} | @${post.accountHandle} | ${metric} |`);
  });
  lines.push('');

  lines.push('## 5. 関連クラスタ');
  lines.push('');
  digest.clusters.forEach((cluster, index) => {
    lines.push(`### ${index + 1}. ${cluster.label}`);
    lines.push('');
    lines.push(`- 件数: ${cluster.postCount}`);
    lines.push(`- アカウント: ${cluster.accountHandles.join(', ')}`);
    lines.push(`- 総ビュー: ${formatCompactNumber(cluster.totalViews)} / 総いいね: ${formatCompactNumber(cluster.totalLikes)}`);
    lines.push(`- 要約: ${cluster.summary}`);
    lines.push('- 引用候補:');
    cluster.representative.forEach(post => {
      lines.push(`  - [${post.author}](${post.url}) - ${post.headline}`);
    });
    lines.push('- 記事で拾う論点:');
    cluster.editorialAngles.forEach(angle => lines.push(`  - ${angle}`));
    lines.push('');
  });

  lines.push('## 6. ブログ本文ドラフト');
  lines.push('');
  lines.push(digest.body);
  lines.push('');

  if (digest.meta.warnings.length) {
    lines.push('## 7. 実行メモ / 警告');
    lines.push('');
    digest.meta.warnings.forEach(warning => lines.push(`- ${warning}`));
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function renderSidecar(digest) {
  return JSON.stringify(digest, null, 2);
}

function countBy(items, getter) {
  const counts = new Map();
  for (const item of items) {
    const key = getter(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function sortedCounts(counts) {
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key, 'ja'));
}

function formatCompactNumber(value) {
  if (!Number.isFinite(value) || value <= 0) return '0';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}K`;
  return String(value);
}

function escapePipes(text) {
  return String(text ?? '').replaceAll('|', '\\|');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const raw = readJson(options.input);
  const normalized = normalizeAccounts(raw, options.limit);
  const dateStamp = formatDateStamp(options.date, normalized.accounts);
  const classified = await classifyPosts(normalized.posts, { dryRun: options.dryRun });
  const digest = buildDigest({
    accounts: normalized.accounts,
    posts: classified.posts,
    dateStamp,
    inputPath: options.input,
    classifierMode: classified.mode,
    warnings: classified.warnings,
  });

  ensureDir(options.outputDir);

  const mdPath = resolve(options.outputDir, `foryou-digest-${dateStamp}.md`);
  const markdown = renderMarkdown(digest);
  writeFileSync(mdPath, markdown);

  let jsonPath = null;
  if (options.sidecar) {
    jsonPath = resolve(options.outputDir, `foryou-digest-${dateStamp}.json`);
    writeFileSync(jsonPath, renderSidecar(digest));
  }

  console.log(`Generated ${mdPath}`);
  if (jsonPath) console.log(`Generated ${jsonPath}`);
  console.log(`Classifier mode: ${digest.meta.classifierMode}`);
  console.log(`Posts: ${digest.meta.postCount} / Accounts: ${digest.meta.accountCount}`);
  if (digest.meta.warnings.length) {
    console.log(`Warnings: ${digest.meta.warnings.length}`);
  }
}

main().catch(error => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
