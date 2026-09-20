import express from 'express';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { chromium } from 'playwright';
import http from 'http';

const TYPESAFE_API_KEY = process.env.TYPESAFE_API_KEY || '';
const PORT = process.env.PORT || 3456;
const ALLOWED_EXTENSION_ORIGIN = process.env.ALLOWED_EXTENSION_ORIGIN || 'chrome-extension://';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// CORS設定：拡張機能のoriginを許可
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || origin.startsWith('chrome-extension://') || origin === 'http://localhost') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

app.use(express.json());

// Playwrightブラウザインスタンス（フォールバック用）
let browser = null;
let page = null;

// ヘルスチェック
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    hasApiKey: !!TYPESAFE_API_KEY 
  });
});

// TypeSafe APIへのプロキシエンドポイント（APIキーをサーバー側で管理）
app.post('/api/jev/recognize', async (req, res) => {
  try {
    if (!TYPESAFE_API_KEY) {
      return res.status(500).json({ error: 'TYPESAFE_API_KEY not configured' });
    }

    const { audio, policy } = req.body;
    
    // TypeSafe APIの呼び出し（ダミー実装）
    // 実際にはここで音声認識APIを呼び出す
    const response = await mockTypeSafeAPI(audio, policy);
    
    res.json(response);
  } catch (error) {
    console.error('Recognition error:', error);
    res.status(500).json({ error: error.message });
  }
});

// WebSocket接続処理
wss.on('connection', (ws, req) => {
  const origin = req.headers.origin;
  console.log('WebSocket connection from:', origin);

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('Received message:', data.type);

      switch (data.type) {
        case 'recognize':
          // 音声認識リクエスト
          const result = await handleRecognition(data.audio, data.policy);
          ws.send(JSON.stringify({ type: 'recognition_result', result }));
          break;

        case 'execute_action':
          // アクション実行（クリック、ナビゲーションなど）
          const actionResult = await handleAction(data.action);
          ws.send(JSON.stringify({ type: 'action_result', result: actionResult }));
          break;

        case 'get_snapshot':
          // スナップショット取得（拡張機能がキャプチャする場合は不要）
          const snapshot = await handleSnapshot(data.tabId);
          ws.send(JSON.stringify({ type: 'snapshot_result', snapshot }));
          break;

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;

        default:
          ws.send(JSON.stringify({ type: 'error', error: 'Unknown message type' }));
      }
    } catch (error) {
      console.error('Message handling error:', error);
      ws.send(JSON.stringify({ type: 'error', error: error.message }));
    }
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// 音声認識処理
async function handleRecognition(audioData, policy) {
  if (!TYPESAFE_API_KEY) {
    throw new Error('TYPESAFE_API_KEY not configured');
  }

  // TypeSafe APIを使った音声認識
  return await mockTypeSafeAPI(audioData, policy);
}

// アクション実行処理
async function handleAction(action) {
  console.log('Executing action:', action);
  
  // 拡張機能が直接実行するため、ここではログのみ
  // フォールバックとしてPlaywrightを使用する場合の実装
  if (action.useFallback && browser) {
    switch (action.type) {
      case 'click':
        await page.click(action.selector);
        break;
      case 'navigate':
        await page.goto(action.url);
        break;
      case 'type':
        await page.type(action.selector, action.text);
        break;
    }
  }

  return { success: true };
}

// スナップショット処理（フォールバック用）
async function handleSnapshot(tabId) {
  if (!browser) {
    return { error: 'Playwright browser not initialized' };
  }

  const screenshot = await page.screenshot({ encoding: 'base64' });
  const html = await page.content();

  return {
    screenshot,
    html,
    url: page.url()
  };
}

// TypeSafe APIのモック実装
async function mockTypeSafeAPI(audio, policy) {
  // 実際にはここでTypeSafe APIを呼び出す
  // 現在はダミーレスポンスを返す
  await new Promise(resolve => setTimeout(resolve, 100));
  
  return {
    transcript: 'サンプル音声認識結果',
    confidence: 0.95,
    intent: 'search',
    entities: [],
    timestamp: new Date().toISOString()
  };
}

// Playwrightブラウザの初期化（フォールバック用）
async function initPlaywrightBrowser() {
  try {
    console.log('Initializing Playwright browser (fallback)...');
    browser = await chromium.launch({ 
      headless: false,
      args: ['--start-maximized']
    });
    const context = await browser.newContext();
    page = await context.newPage();
    console.log('Playwright browser initialized');
  } catch (error) {
    console.error('Failed to initialize Playwright:', error);
  }
}

// サーバー起動
server.listen(PORT, () => {
  console.log(`Jev Voice Browser server running on http://localhost:${PORT}`);
  console.log(`WebSocket server ready on ws://localhost:${PORT}`);
  console.log(`API Key configured: ${!!TYPESAFE_API_KEY}`);
  
  // Playwrightブラウザをフォールバックとして初期化（オプション）
  // 必要に応じてコメントを外す
  // initPlaywrightBrowser();
});

// グレースフルシャットダウン
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  if (browser) {
    await browser.close();
  }
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
