// サーバー設定
const DEFAULT_SERVER_URL = 'ws://localhost:3456';
let ws = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// DOM要素
const elements = {
  connectionStatus: document.getElementById('connectionStatus'),
  statusText: document.getElementById('statusText'),
  recordBtn: document.getElementById('recordBtn'),
  recordText: document.getElementById('recordText'),
  recordingIndicator: document.getElementById('recordingIndicator'),
  textInput: document.getElementById('textInput'),
  sendBtn: document.getElementById('sendBtn'),
  resultArea: document.getElementById('resultArea'),
  logArea: document.getElementById('logArea'),
  autoExecute: document.getElementById('autoExecute'),
  settingsBtn: document.getElementById('settingsBtn'),
  serverInfo: document.getElementById('serverInfo')
};

// 初期化
async function init() {
  log('拡張機能を初期化しています...', 'info');
  
  // 設定の読み込み
  const settings = await loadSettings();
  elements.autoExecute.checked = settings.autoExecute ?? true;
  
  // イベントリスナーの設定
  setupEventListeners();
  
  // WebSocket接続
  connectToServer();
  
  log('初期化完了', 'success');
}

// イベントリスナーの設定
function setupEventListeners() {
  // 録音ボタン
  elements.recordBtn.addEventListener('click', toggleRecording);
  
  // テキスト送信
  elements.sendBtn.addEventListener('click', sendTextCommand);
  elements.textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      sendTextCommand();
    }
  });
  
  // 設定変更
  elements.autoExecute.addEventListener('change', saveSettings);
  elements.settingsBtn.addEventListener('click', openSettings);
}

// WebSocket接続
function connectToServer() {
  const serverUrl = DEFAULT_SERVER_URL;
  elements.serverInfo.textContent = serverUrl.replace('ws://', '');
  
  try {
    ws = new WebSocket(serverUrl);
    
    ws.addEventListener('open', () => {
      log('サーバーに接続しました', 'success');
      updateConnectionStatus('connected');
      elements.recordBtn.disabled = false;
      elements.sendBtn.disabled = false;
      
      // Ping送信
      sendMessage({ type: 'ping' });
    });
    
    ws.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        handleServerMessage(data);
      } catch (error) {
        log(`メッセージ解析エラー: ${error.message}`, 'error');
      }
    });
    
    ws.addEventListener('close', () => {
      log('サーバーとの接続が切断されました', 'error');
      updateConnectionStatus('disconnected');
      elements.recordBtn.disabled = true;
      elements.sendBtn.disabled = true;
      
      // 再接続を試行
      setTimeout(connectToServer, 5000);
    });
    
    ws.addEventListener('error', (error) => {
      log(`WebSocketエラー: ${error.message || '接続に失敗しました'}`, 'error');
      updateConnectionStatus('error');
    });
  } catch (error) {
    log(`接続エラー: ${error.message}`, 'error');
    updateConnectionStatus('error');
  }
}

// サーバーメッセージの処理
function handleServerMessage(data) {
  log(`受信: ${data.type}`, 'info');
  
  switch (data.type) {
    case 'pong':
      // Pong受信
      break;
      
    case 'recognition_result':
      handleRecognitionResult(data.result);
      break;
      
    case 'action_result':
      handleActionResult(data.result);
      break;
      
    case 'error':
      log(`サーバーエラー: ${data.error}`, 'error');
      addResult('エラー', data.error, 'error');
      break;
      
    default:
      log(`未知のメッセージタイプ: ${data.type}`, 'error');
  }
}

// 音声認識結果の処理
function handleRecognitionResult(result) {
  log(`認識結果: ${result.transcript}`, 'success');
  addResult(result.transcript, `信頼度: ${(result.confidence * 100).toFixed(1)}%`, 'success');
  
  // 自動実行が有効な場合はアクションを実行
  if (elements.autoExecute.checked && result.intent) {
    executeAction(result);
  }
}

// アクション結果の処理
function handleActionResult(result) {
  if (result.success) {
    log('アクション実行成功', 'success');
    addResult('実行完了', 'アクションが正常に実行されました', 'success');
  } else {
    log(`アクション実行失敗: ${result.error || '不明なエラー'}`, 'error');
    addResult('実行失敗', result.error || '不明なエラー', 'error');
  }
}

// 録音の開始/停止
async function toggleRecording() {
  if (isRecording) {
    stopRecording();
  } else {
    await startRecording();
  }
}

// 録音開始
async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    
    mediaRecorder.addEventListener('dataavailable', (event) => {
      audioChunks.push(event.data);
    });
    
    mediaRecorder.addEventListener('stop', async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      await sendAudioToServer(audioBlob);
      
      // ストリームを停止
      stream.getTracks().forEach(track => track.stop());
    });
    
    mediaRecorder.start();
    isRecording = true;
    
    elements.recordBtn.classList.add('recording');
    elements.recordText.textContent = '停止';
    elements.recordingIndicator.classList.add('active');
    
    log('録音を開始しました', 'info');
  } catch (error) {
    log(`マイクアクセスエラー: ${error.message}`, 'error');
    alert('マイクへのアクセスが拒否されました。ブラウザの設定を確認してください。');
  }
}

// 録音停止
function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    isRecording = false;
    
    elements.recordBtn.classList.remove('recording');
    elements.recordText.textContent = '音声入力';
    elements.recordingIndicator.classList.remove('active');
    
    log('録音を停止しました', 'info');
  }
}

// 音声データをサーバーに送信
async function sendAudioToServer(audioBlob) {
  try {
    // BlobをBase64に変換
    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);
    
    reader.onloadend = () => {
      const base64Audio = reader.result.split(',')[1];
      
      sendMessage({
        type: 'recognize',
        audio: base64Audio,
        policy: 'default'
      });
      
      log('音声データを送信しました', 'info');
    };
  } catch (error) {
    log(`音声送信エラー: ${error.message}`, 'error');
  }
}

// テキストコマンドの送信
function sendTextCommand() {
  const text = elements.textInput.value.trim();
  
  if (!text) {
    return;
  }
  
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    log('サーバーに接続されていません', 'error');
    return;
  }
  
  // テキストを音声認識結果と同じ形式で送信
  sendMessage({
    type: 'recognize',
    audio: null,
    text: text,
    policy: 'default'
  });
  
  log(`テキスト送信: ${text}`, 'info');
  addResult(text, '処理中...', 'info');
  
  // 入力をクリア
  elements.textInput.value = '';
}

// アクションの実行
async function executeAction(result) {
  try {
    // 現在のタブ情報を取得
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      log('アクティブなタブが見つかりません', 'error');
      return;
    }
    
    // スナップショットを取得
    const snapshot = await captureTabSnapshot(tab.id);
    
    // サーバーにアクション実行を依頼
    sendMessage({
      type: 'execute_action',
      action: {
        type: result.intent,
        tabId: tab.id,
        snapshot: snapshot,
        entities: result.entities
      }
    });
    
    log('アクション実行を依頼しました', 'info');
  } catch (error) {
    log(`アクション実行エラー: ${error.message}`, 'error');
  }
}

// タブのスナップショットを取得
async function captureTabSnapshot(tabId) {
  try {
    // コンテンツスクリプトからDOM情報を取得
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        return {
          url: window.location.href,
          title: document.title,
          html: document.documentElement.outerHTML,
          clickableElements: Array.from(document.querySelectorAll('a, button, input, select'))
            .map(el => ({
              tag: el.tagName,
              text: el.textContent?.trim().substring(0, 100),
              id: el.id,
              className: el.className
            }))
        };
      }
    });
    
    // スクリーンショットを取得
    const screenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    
    return {
      ...result.result,
      screenshot
    };
  } catch (error) {
    log(`スナップショット取得エラー: ${error.message}`, 'error');
    return null;
  }
}

// メッセージ送信
function sendMessage(message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  } else {
    log('サーバーに接続されていません', 'error');
  }
}

// 接続状態の更新
function updateConnectionStatus(status) {
  elements.connectionStatus.className = `status ${status}`;
  
  switch (status) {
    case 'connected':
      elements.statusText.textContent = '接続済み';
      break;
    case 'disconnected':
      elements.statusText.textContent = '切断';
      break;
    case 'error':
      elements.statusText.textContent = 'エラー';
      break;
    default:
      elements.statusText.textContent = '接続中...';
  }
}

// 結果の追加
function addResult(transcript, response, type = 'info') {
  // プレースホルダーを削除
  const placeholder = elements.resultArea.querySelector('.placeholder');
  if (placeholder) {
    placeholder.remove();
  }
  
  const resultItem = document.createElement('div');
  resultItem.className = `result-item ${type}`;
  
  const transcriptEl = document.createElement('div');
  transcriptEl.className = 'transcript';
  transcriptEl.textContent = transcript;
  
  const responseEl = document.createElement('div');
  responseEl.className = 'response';
  responseEl.textContent = response;
  
  const timestampEl = document.createElement('div');
  timestampEl.className = 'timestamp';
  timestampEl.textContent = new Date().toLocaleTimeString('ja-JP');
  
  resultItem.appendChild(transcriptEl);
  resultItem.appendChild(responseEl);
  resultItem.appendChild(timestampEl);
  
  elements.resultArea.insertBefore(resultItem, elements.resultArea.firstChild);
  
  // 古い結果を削除（最大10件）
  const results = elements.resultArea.querySelectorAll('.result-item');
  if (results.length > 10) {
    results[results.length - 1].remove();
  }
}

// ログの追加
function log(message, type = 'info') {
  console.log(`[${type.toUpperCase()}] ${message}`);
  
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry ${type}`;
  
  const time = document.createElement('span');
  time.className = 'time';
  time.textContent = new Date().toLocaleTimeString('ja-JP');
  
  const text = document.createElement('span');
  text.textContent = message;
  
  logEntry.appendChild(time);
  logEntry.appendChild(text);
  
  elements.logArea.insertBefore(logEntry, elements.logArea.firstChild);
  
  // 古いログを削除（最大50件）
  const logs = elements.logArea.querySelectorAll('.log-entry');
  if (logs.length > 50) {
    logs[logs.length - 1].remove();
  }
}

// 設定の保存
async function saveSettings() {
  const settings = {
    autoExecute: elements.autoExecute.checked
  };
  
  await chrome.storage.local.set({ settings });
  log('設定を保存しました', 'success');
}

// 設定の読み込み
async function loadSettings() {
  const result = await chrome.storage.local.get('settings');
  return result.settings || {};
}

// 設定画面を開く
function openSettings() {
  // 簡易的なアラートで設定を表示
  alert('設定:\n\n- サーバーURL: ' + DEFAULT_SERVER_URL + '\n- 自動実行: ' + (elements.autoExecute.checked ? '有効' : '無効'));
}

// 初期化実行
init();
