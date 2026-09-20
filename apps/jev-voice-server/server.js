import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 設定
const PORT = process.env.PORT || 8765;
const HOST = process.env.HOST || '0.0.0.0'; // LAN接続用
const AUTH_TOKEN = process.env.AUTH_TOKEN || generateToken();
const TYPESAFE_API_KEY = process.env.TYPESAFE_API_KEY; // PC側のみで保持

// トークン生成（初回起動時）
function generateToken() {
  return Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
}

// For Youデータの読み込み
let foryouData = null;
try {
  const dataPath = join(__dirname, '../../foryou-data.json');
  foryouData = JSON.parse(readFileSync(dataPath, 'utf8'));
} catch (err) {
  console.warn('For You data not found, using empty data');
  foryouData = { accounts: [] };
}

// HTTPサーバー
const server = createServer((req, res) => {
  // CORS対応
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // 認証チェック
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (HOST === '0.0.0.0' && token !== AUTH_TOKEN) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  // ヘルスチェック
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', server: 'jev-voice-server' }));
    return;
  }

  // For Youデータ取得
  if (url.pathname === '/api/foryou') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(foryouData));
    return;
  }

  // コマンド実行
  if (url.pathname === '/api/command' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { command, text } = JSON.parse(body);
        console.log(`Command received: ${command} - "${text}"`);
        
        // コマンド処理（実装例）
        const result = handleCommand(command, text);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));

        // WebSocketクライアントに通知
        broadcastToClients({ type: 'command_executed', command, text, result });
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// WebSocketサーバー
const wss = new WebSocketServer({ server });

const clients = new Set();

wss.on('connection', (ws, req) => {
  console.log('WebSocket client connected');

  // 認証チェック（WebSocket）
  const url = new URL(req.url, `ws://${req.headers.host}`);
  const wsToken = url.searchParams.get('token');
  
  if (HOST === '0.0.0.0' && wsToken !== AUTH_TOKEN) {
    ws.close(1008, 'Unauthorized');
    return;
  }

  clients.add(ws);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('WebSocket message:', data);

      if (data.type === 'command') {
        const result = handleCommand(data.command, data.text);
        ws.send(JSON.stringify({ type: 'command_result', result }));
        
        // 他のクライアントに通知
        broadcastToClients({ type: 'command_executed', ...data, result }, ws);
      } else if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      }
    } catch (err) {
      console.error('WebSocket message error:', err);
      ws.send(JSON.stringify({ type: 'error', message: err.message }));
    }
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    clients.delete(ws);
  });

  // 接続確認メッセージ
  ws.send(JSON.stringify({ 
    type: 'connected', 
    message: 'Connected to jev-voice-server',
    accountsCount: foryouData.accounts.length 
  }));
});

// 全クライアントへのブロードキャスト
function broadcastToClients(data, exclude = null) {
  const message = JSON.stringify(data);
  clients.forEach(client => {
    if (client !== exclude && client.readyState === 1) { // OPEN
      client.send(message);
    }
  });
}

// コマンド処理（拡張可能）
function handleCommand(command, text) {
  switch (command) {
    case 'search':
      return searchInForyou(text);
    case 'refresh':
      return { success: true, message: 'Refresh requested' };
    case 'navigate':
      return { success: true, message: `Navigate to: ${text}` };
    case 'speak':
      return { success: true, message: `Speaking: ${text}` };
    default:
      return { success: false, message: `Unknown command: ${command}` };
  }
}

// For You内検索
function searchInForyou(query) {
  if (!query) return { success: false, message: 'No query provided' };

  const results = [];
  for (const account of foryouData.accounts) {
    for (const post of account.posts) {
      const searchText = `${post.text} ${post.textJa || ''}`.toLowerCase();
      if (searchText.includes(query.toLowerCase())) {
        results.push({
          account: account.handle,
          author: post.author,
          text: post.text,
          textJa: post.textJa,
          url: post.url
        });
      }
    }
  }

  return {
    success: true,
    query,
    count: results.length,
    results: results.slice(0, 10) // 最初の10件
  };
}

// サーバー起動
server.listen(PORT, HOST, () => {
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  JEV Voice Server Started
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  HTTP:      http://${HOST}:${PORT}
  WebSocket: ws://${HOST}:${PORT}
  
  Auth Token: ${AUTH_TOKEN}
  
  For Android app, use:
  - Server URL: ws://[YOUR_PC_IP]:${PORT}
  - Token: ${AUTH_TOKEN}
  
  Save this token for client configuration!
  
  Accounts loaded: ${foryouData.accounts.length}
  
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});
