/**
 * voice-to-foryou-bridge.js
 * 
 * jev-voice-browserで収集したコンテンツをFor You形式に変換するブリッジスクリプト
 * 
 * 使用方法:
 *   node scripts/voice-to-foryou-bridge.js [--dry-run] < input.json
 * 
 * 入力形式:
 * {
 *   "items": [
 *     {
 *       "title": "記事タイトル",
 *       "url": "https://example.com/article",
 *       "summary": "記事の要約",
 *       "author": "作者名（オプション）",
 *       "source": "ソース名（オプション）",
 *       "timestamp": "2026-09-20T04:00:00Z（オプション）"
 *     }
 *   ]
 * }
 * 
 * 出力形式: For You形式のJSON配列
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { stdin } from 'node:process';

// For You形式のID生成
function generateId(index, source) {
  const timestamp = Date.now();
  const sourcePrefix = (source || 'voice').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${sourcePrefix}_${timestamp}_${index}`;
}

// ハンドル名の生成
function generateHandle(source, author) {
  if (author) {
    return author.toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  if (source) {
    return source.toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  return 'voicecollected';
}

// For You形式に変換
function convertToForyouFormat(item, index) {
  const source = item.source || 'Voice Browser';
  const author = item.author || source;
  const handle = generateHandle(source, item.author);
  
  // テキストの生成（タイトル + サマリー）
  let text = item.title || '';
  if (item.summary) {
    text = text ? `${text}: ${item.summary}` : item.summary;
  }
  
  // URLがない場合は警告
  if (!item.url) {
    console.warn(`Warning: Item ${index} has no URL`);
  }
  
  const post = {
    id: generateId(index, source),
    author: author,
    handle: handle,
    text: text || '(No text)',
    url: item.url || '',
    createdAt: item.timestamp || new Date().toISOString()
  };
  
  // オプションフィールド
  if (item.textJa) {
    post.textJa = item.textJa;
  }
  if (item.lang) {
    post.lang = item.lang;
  }
  if (item.media) {
    post.media = item.media;
  }
  if (item.metrics) {
    post.metrics = item.metrics;
  }
  if (item.avatar) {
    post.avatar = item.avatar;
  }
  
  return post;
}

// 標準入力からJSONを読み取る
async function readStdin() {
  const chunks = [];
  for await (const chunk of stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// メイン処理
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const help = args.includes('--help') || args.includes('-h');
  
  if (help) {
    console.log(`
Usage: node scripts/voice-to-foryou-bridge.js [OPTIONS] < input.json

Options:
  --dry-run    変換結果を標準出力に出力（foryou-data.jsonに追加しない）
  --help, -h   このヘルプを表示

Input format (JSON):
{
  "items": [
    {
      "title": "Article Title",
      "url": "https://example.com/article",
      "summary": "Article summary",
      "author": "Author Name (optional)",
      "source": "Source Name (optional)",
      "timestamp": "2026-09-20T04:00:00Z (optional)"
    }
  ]
}

Example:
  echo '{"items":[{"title":"AI News","url":"https://example.com","summary":"Breaking news"}]}' | \\
    node scripts/voice-to-foryou-bridge.js --dry-run
`);
    process.exit(0);
  }
  
  try {
    // 入力JSONの読み取り
    const inputJson = await readStdin();
    
    if (!inputJson.trim()) {
      console.error('Error: No input provided. Pipe JSON data to stdin.');
      console.error('Example: echo \'{"items":[...]}\' | node scripts/voice-to-foryou-bridge.js');
      process.exit(1);
    }
    
    const input = JSON.parse(inputJson);
    
    if (!input.items || !Array.isArray(input.items)) {
      console.error('Error: Input must have an "items" array');
      process.exit(1);
    }
    
    // 各アイテムをFor You形式に変換
    const posts = input.items.map((item, index) => convertToForyouFormat(item, index));
    
    if (dryRun) {
      // ドライラン: 標準出力に出力
      console.log('=== Dry Run: Converted Posts ===');
      console.log(JSON.stringify(posts, null, 2));
      console.log('\n=== Summary ===');
      console.log(`Converted ${posts.length} items`);
    } else {
      // foryou-data.jsonに追加
      const foryouDataPath = new URL('../foryou-data.json', import.meta.url);
      const foryouData = JSON.parse(readFileSync(foryouDataPath, 'utf8'));
      
      // "Voice Collected"アカウントを探すか、新規作成
      let voiceAccount = foryouData.accounts.find(acc => acc.handle === 'voicecollected');
      
      if (!voiceAccount) {
        voiceAccount = {
          name: 'Voice Collected',
          handle: 'voicecollected',
          sample: false,
          updatedAt: new Date().toISOString(),
          posts: []
        };
        foryouData.accounts.push(voiceAccount);
        console.log('Created new "Voice Collected" account');
      }
      
      // 既存のポストIDをチェック（重複回避）
      const existingIds = new Set(voiceAccount.posts.map(p => p.id));
      const newPosts = posts.filter(p => !existingIds.has(p.id));
      
      // 新しいポストを追加
      voiceAccount.posts.unshift(...newPosts);
      voiceAccount.updatedAt = new Date().toISOString();
      
      // ファイルに書き込み
      writeFileSync(foryouDataPath, JSON.stringify(foryouData, null, 2));
      
      console.log(`Added ${newPosts.length} new posts to "Voice Collected" account`);
      console.log(`Skipped ${posts.length - newPosts.length} duplicate posts`);
      console.log(`Total posts in account: ${voiceAccount.posts.length}`);
      console.log('\nNext steps:');
      console.log('  1. Run: node scripts/build-foryou.mjs');
      console.log('  2. Open: foryou.html in your browser');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
