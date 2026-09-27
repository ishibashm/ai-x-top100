#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);

function parseArgs() {
  const args = {
    dataPath: 'foryou-data.json',
    topic: 'jev|typesafe|system one',
    account: null,
    dryRun: false,
    help: false
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--data' && i + 1 < process.argv.length) {
      args.dataPath = process.argv[++i];
    } else if ((arg === '--topic' || arg === '--keyword') && i + 1 < process.argv.length) {
      args.topic = process.argv[++i];
    } else if (arg === '--account' && i + 1 < process.argv.length) {
      args.account = process.argv[++i];
    }
  }

  return args;
}

function showHelp() {
  console.log(`
Usage: node scripts/draft-cloud-from-foryou.mjs [options]

For Youボードのシグナルから@cloud8wq用の長文日本語ドラフトを生成します。

Options:
  --data PATH          foryou-data.jsonのパス (デフォルト: foryou-data.json)
  --topic PATTERN      フィルタリング用トピックキーワード (デフォルト: "jev|typesafe|system one")
  --keyword PATTERN    --topicと同じ
  --account HANDLE     ボードアカウントハンドルでフィルタリング (例: GazerStar79330)
  --dry-run            ファイルを書き込まずに概要だけ表示
  -h, --help           このヘルプを表示

Examples:
  node scripts/draft-cloud-from-foryou.mjs
  node scripts/draft-cloud-from-foryou.mjs --topic "grok|ai" --dry-run
  node scripts/draft-cloud-from-foryou.mjs --account GazerStar79330
`);
}

function filterPosts(data, topicPattern, accountHandle) {
  const regex = new RegExp(topicPattern, 'i');
  const matches = [];

  for (const account of data.accounts) {
    if (accountHandle && account.handle !== accountHandle) {
      continue;
    }

    for (const post of account.posts) {
      const textToSearch = (post.text || '') + ' ' + (post.textJa || '');
      if (regex.test(textToSearch)) {
        matches.push({
          id: post.id,
          author: post.author || post.name,
          handle: post.handle,
          text: post.text,
          textJa: post.textJa,
          url: post.url,
          boardAccount: account.handle,
          boardAccountName: account.name,
          boardUpdatedAt: account.updatedAt,
          createdAt: post.createdAt,
          metrics: post.metrics
        });
      }
    }
  }

  return matches;
}

function deduplicateById(posts) {
  const seen = new Set();
  const unique = [];

  for (const post of posts) {
    if (!seen.has(post.id)) {
      seen.add(post.id);
      unique.push(post);
    }
  }

  return unique;
}

function formatDate() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

function generateMarkdownDraft(posts, topic) {
  const dateStr = formatDate();
  const topPosts = posts.slice(0, 8);
  
  let md = `# 【海外AI動向】${topic} 関連の注目シグナル\n\n`;
  md += `生成日: ${dateStr}\n\n`;
  md += `## 見出し\n\n`;
  md += `<!-- TODO: トピックから魅力的な見出しを作成 -->\n`;
  md += `${topic} の最新動向：開発者が注目する理由\n\n`;
  
  md += `## 背景\n\n`;
  md += `<!-- For Youボードから抽出。以下は主要なシグナル -->\n\n`;
  
  for (const post of topPosts) {
    const snippet = post.text.substring(0, 100).replace(/\n/g, ' ');
    md += `- [@${post.handle}](${post.url}): ${snippet}${post.text.length > 100 ? '...' : ''}\n`;
  }
  
  md += `\n<!-- ⚠️ボード由来の情報。一次ソースで検証が必要 -->\n\n`;
  
  md += `## 要点\n\n`;
  md += `<!-- TODO: 上記シグナルから主要ポイントを3-5個抽出 -->\n\n`;
  md += `- ポイント1: \n`;
  md += `- ポイント2: \n`;
  md += `- ポイント3: \n\n`;
  
  md += `## なぜ重要か\n\n`;
  md += `<!-- TODO: ビジネス・技術的な意義を説明 -->\n\n`;
  
  md += `## 注意点\n\n`;
  md += `- 本ドラフトはFor Youボードから自動抽出されたシグナルです\n`;
  md += `- ベンダーの主張や古いボード日付を含む可能性があります\n`;
  md += `- X への投稿前に必ず内容を確認・修正してください\n`;
  md += `- **自動投稿は禁止。必ず人間が確認してから投稿すること**\n\n`;
  
  md += `## 元リンク\n\n`;
  const uniqueUrls = [...new Set(topPosts.map(p => p.url).filter(Boolean))];
  for (const url of uniqueUrls) {
    md += `- ${url}\n`;
  }
  
  md += `\n---\n\n`;
  md += `**文字数目安**: 800-2500文字\n`;
  md += `**投稿確認**: 人間による承認が必須\n`;

  return md;
}

function main() {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  const dataPath = fileURLToPath(new URL(args.dataPath, root));
  
  let data;
  try {
    data = JSON.parse(readFileSync(dataPath, 'utf8'));
  } catch (err) {
    console.error(`エラー: データファイルを読み込めませんでした: ${dataPath}`);
    console.error(err.message);
    process.exit(1);
  }

  console.log(`データ読み込み: ${args.dataPath}`);
  console.log(`トピックパターン: ${args.topic}`);
  if (args.account) {
    console.log(`アカウントフィルタ: ${args.account}`);
  }
  console.log();

  const matches = filterPosts(data, args.topic, args.account);
  const unique = deduplicateById(matches);

  console.log(`マッチした投稿: ${matches.length}件 (重複除去後: ${unique.length}件)`);
  
  if (unique.length === 0) {
    console.log('マッチする投稿が見つかりませんでした。');
    process.exit(0);
  }

  const dateStr = formatDate();
  const signalsPath = `drafts/cloud-from-foryou-${dateStr}-signals.json`;
  const draftPath = `drafts/cloud-from-foryou-${dateStr}.md`;

  if (args.dryRun) {
    console.log('\n=== DRY RUN ===');
    console.log(`書き込み予定ファイル:`);
    console.log(`  - ${signalsPath}`);
    console.log(`  - ${draftPath}`);
    console.log('\n先頭5件のシグナル:');
    for (const post of unique.slice(0, 5)) {
      console.log(`  - [@${post.handle}] ${post.text.substring(0, 80)}...`);
    }
  } else {
    const signalsData = {
      generatedAt: new Date().toISOString(),
      topic: args.topic,
      account: args.account,
      totalMatches: unique.length,
      signals: unique.map(p => ({
        id: p.id,
        author: p.author,
        handle: p.handle,
        text: p.text.substring(0, 200),
        url: p.url,
        boardAccount: p.boardAccount,
        boardAccountName: p.boardAccountName,
        boardUpdatedAt: p.boardUpdatedAt,
        createdAt: p.createdAt,
        views: p.metrics?.views,
        likes: p.metrics?.likes
      }))
    };

    writeFileSync(signalsPath, JSON.stringify(signalsData, null, 2));
    console.log(`✓ シグナルファイル書き込み: ${signalsPath}`);

    const markdown = generateMarkdownDraft(unique, args.topic);
    writeFileSync(draftPath, markdown);
    console.log(`✓ ドラフト書き込み: ${draftPath}`);
  }

  console.log('\n完了しました。');
}

main();
