import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  BOARD_LIMIT, PART_SIZE, MANUAL_EXCLUDE, buildTop100, categoryOf, dumps, embedBoard, formatMetric,
  loadResponses, main, parseArgs, readTranslations, snippetOf, updatedLabelFromDate, writeTop100,
} from '../scripts/build-top100.mjs';

const root = new URL('../', import.meta.url);
const fixtureDir = new URL('./fixtures/top100/', import.meta.url);
const read = name => readFileSync(new URL(name, root), 'utf8');
const boardFrom = html => {
  const match = html.match(/<script\b[^>]*\bid=["']board-data["'][^>]*>([\s\S]*?)<\/script>/);
  assert.ok(match, 'board-data');
  return JSON.parse(match[1]);
};

function fixtureResult() {
  return buildTop100(loadResponses(fileURLToPath(new URL('raw/', fixtureDir))), {
    translations: readTranslations(fileURLToPath(new URL('ja.json', fixtureDir))),
    updatedLabel: '2026-10-20 更新',
  });
}

test('metric formatting matches the K/M rules, including the 10 boundary', () => {
  assert.equal(formatMetric(850), '850');
  assert.equal(formatMetric(9965), '10.0K');
  assert.equal(formatMetric(10027), '10K');
  assert.equal(formatMetric(9600000), '9.6M');
  assert.equal(formatMetric(10000000), '10M');
  assert.equal(formatMetric(21248130), '21M');
  assert.equal(formatMetric(0), '0');
});

test('snippet collapses whitespace and cuts on code points', () => {
  assert.equal(snippetOf('I love AI models\n\nmore'), 'I love AI models more');
  assert.equal(snippetOf('😀'.repeat(141)), '😀'.repeat(140) + '…');
  assert.equal(Array.from(snippetOf('AI ' + 'x'.repeat(200))).length, 141);
});

test('category priority is jev, then launch, then eval, then lab, then other', () => {
  assert.equal(categoryOf('OpenAI', 'jev is the new path'), 'jev');
  assert.equal(categoryOf('OpenAI', 'GPT-6 is now available.'), '発表');
  assert.equal(categoryOf('OpenAI', 'we are launching a benchmark'), '発表');
  assert.equal(categoryOf('OpenAI', 'Our safety eval record'), '評価');
  assert.equal(categoryOf('nvidia', 'CUDA is now available'), '発表');
  assert.equal(categoryOf('nvidia', 'quarterly update'), '研究所');
  assert.equal(categoryOf('elonmusk', 'AI is the future'), '研究所');
  assert.equal(categoryOf('someone', 'new AI benchmark score'), '評価');
  assert.equal(categoryOf('someone', 'AI models matter'), 'その他');
});

test('fixture raw responses rank, cap, and translate deterministically', () => {
  const first = fixtureResult();
  const second = fixtureResult();
  assert.deepEqual(second, first);
  assert.equal(first.candidates, 17);
  const ids = first.posts.map(post => post.id);
  assert.deepEqual(ids, ['2002', '2006', '2001', '2010', '2009', '2011', '2012', '2013', '2019', '2016', '2018', '2020', '2017', '2015']);
  for (const dropped of ['2003', '2004', '2005', '2007', '2008', '2014', '2021', '2112015643126165669']) assert.equal(ids.includes(dropped), false);
  assert.deepEqual(first.posts.map(post => [post.id, post.category, post.metric]), [
    ['2002', '研究所', '9.0M'], ['2006', 'その他', '6.0M'], ['2001', '発表', '5.0M'], ['2010', 'その他', '4.5M'],
    ['2009', 'その他', '4.5M'], ['2011', 'jev', '3.0M'], ['2012', '評価', '2.0M'], ['2013', '研究所', '1.5M'],
    ['2019', 'その他', '1.2M'], ['2016', 'その他', '1.2M'], ['2018', 'その他', '1.1M'], ['2020', '評価', '970K'],
    ['2017', 'その他', '960'], ['2015', 'その他', '850'],
  ]);
  const byId = Object.fromEntries(first.posts.map(post => [post.id, post]));
  assert.equal(byId['2002'].name, 'Elon Overwrite');
  assert.equal(byId['2002'].text, 'AI is the future');
  assert.equal(byId['2002'].views, 9000000);
  assert.equal(byId['2002'].avatar, 'https://pbs.twimg.com/profile_images/late_200x200.jpg');
  assert.equal(byId['2001'].snippet_ja, 'GPT-6を公開');
  assert.equal(byId['2001'].media, 'https://pbs.twimg.com/media/pic.jpg');
  assert.equal(byId['2001'].avatar, 'https://pbs.twimg.com/profile_images/abc_200x200.jpg');
  assert.equal(byId['2009'].snippet, 'I love AI models more');
  assert.equal(byId['2009'].text, 'I love AI models\n\nmore');
  assert.ok(byId['2010'].likes > byId['2009'].likes && byId['2010'].views === byId['2009'].views);
  assert.equal(byId['2016'].text, 'Long note about AI models and agents.');
  assert.equal(byId['2017'].text, 'AI & ML <labs>');
  assert.equal(byId['2018'].snippet_ja, '生成AIの話');
  assert.equal(byId['2006'].snippet_ja, null);
  assert.equal(JSON.parse(dumps(first.parts[0]))[0].id, '2002');
  assert.equal(first.parts.length, 1);
  assert.equal(first.meta.updated_label, '2026-10-20 更新');
  assert.equal(first.meta.seeded, 14);
  assert.equal(first.meta.pages, 1);
  assert.equal(first.meta.target, BOARD_LIMIT);
});

test('writer embeds board JSON safely and drops stale part files', t => {
  const dir = mkdtempSync(join(process.cwd(), '.test-top100-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const shell = '<script type="application/json" id="board-data">{"posts":[]}</script>\n';
  writeFileSync(join(dir, 'index.html'), shell);
  writeFileSync(join(dir, 'data-part2.json'), '[]');
  const result = fixtureResult();
  const written = writeTop100(dir, result);
  assert.deepEqual(written, ['index.html']);
  assert.equal(existsSync(join(dir, 'data-part2.json')), false);
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  assert.equal(html.includes('</script><b>'), false);
  assert.equal(html.includes('<labs>'), false);
  assert.ok(html.includes('\\u003c'));
  assert.deepEqual(boardFrom(html).posts, result.posts);
  assert.equal(boardFrom(embedBoard(html, boardFrom(html))).posts[0].id, result.posts[0].id);
  const hostile = embedBoard('<script type="application/json" id="board-data">{}</script>', { text: '</script><b>' });
  assert.equal(hostile.includes('</script><b>'), false);
  assert.deepEqual(boardFrom(hostile), { text: '</script><b>' });
});

test('CLI writes the same board and dry-run touches nothing', t => {
  const dir = mkdtempSync(join(process.cwd(), '.test-top100-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'index.slim.html'), '<script id="board-data" type="application/json">{}</script>');
  const script = fileURLToPath(new URL('../scripts/build-top100.mjs', import.meta.url));
  const args = [
    script,
    '--raw', fileURLToPath(new URL('raw/', fixtureDir)),
    '--translations', fileURLToPath(new URL('ja.json', fixtureDir)),
    '--updated', '2026-10-20',
    '--out', dir,
  ];
  const run = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /board 14/);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'data-part1.json'), 'utf8')), fixtureResult().posts);
  assert.equal(boardFrom(readFileSync(join(dir, 'index.slim.html'), 'utf8')).seeded, 14);
  const before = readFileSync(join(dir, 'data-meta.json'));
  const dry = spawnSync(process.execPath, [...args, '--dry-run'], { encoding: 'utf8' });
  assert.equal(dry.status, 0, dry.stderr);
  assert.deepEqual(readFileSync(join(dir, 'data-meta.json')), before);
  assert.equal(spawnSync(process.execPath, [script, '--updated', '2026-02-31', '--raw', dir], { encoding: 'utf8' }).status, 1);
  assert.equal(spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' }).status, 0);
  assert.throws(() => parseArgs(['--nope']));
  assert.throws(() => updatedLabelFromDate('2026-10-20 更新'));
  assert.throws(() => main(['--raw', dir]));
});

test('published Top100 matches the part files, the pages, and the ranking rules', () => {
  const meta = JSON.parse(read('data-meta.json'));
  const parts = [1, 2, 3, 4].map(n => JSON.parse(read(`data-part${n}.json`)));
  assert.ok(parts.every(part => part.length === PART_SIZE));
  const posts = parts.flat();
  assert.equal(posts.length, 100);
  assert.equal(meta.updated_label, '2026-10-20 更新');
  assert.equal(meta.seeded, 100);
  assert.equal(meta.target, 100);
  assert.equal(meta.page_size, 50);
  assert.equal(meta.pages, 2);
  for (const name of ['index.html', 'index.slim.html']) {
    const board = boardFrom(read(name));
    const { posts: embedded, ...rest } = board;
    assert.deepEqual(rest, meta);
    assert.deepEqual(embedded, posts);
  }
  posts.forEach((post, index) => {
    assert.equal(post.rank, index + 1);
    assert.equal(post.url, `https://x.com/${post.handle}/status/${post.id}`);
    assert.equal(post.metric, formatMetric(post.views || post.likes));
    assert.equal(post.category, categoryOf(post.handle, post.text));
    assert.equal(post.snippet, snippetOf(post.text));
    assert.equal(typeof post.snippet_ja, 'string');
    assert.ok(post.snippet_ja.trim());
    assert.ok(Array.from(post.snippet).length <= 141);
    assert.equal(MANUAL_EXCLUDE.has(post.id), false);
  });
  for (let i = 1; i < posts.length; i += 1) {
    const prev = posts[i - 1];
    assert.ok(prev.views > posts[i].views || (prev.views === posts[i].views && prev.likes >= posts[i].likes));
  }
  const counts = new Map();
  for (const post of posts) counts.set(post.handle, (counts.get(post.handle) || 0) + 1);
  for (const count of counts.values()) assert.ok(count <= 4);
  const categories = new Set(posts.map(post => post.category));
  for (const category of categories) assert.ok(['jev', '発表', '評価', '研究所', 'その他'].includes(category));
});
