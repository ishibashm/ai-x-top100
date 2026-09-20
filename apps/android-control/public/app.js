// For You リモートコントロール - メインアプリケーション

class ForyouController {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 3000;

    this.initElements();
    this.loadSettings();
    this.bindEvents();
    this.registerServiceWorker();
    
    this.addLog('アプリケーション起動', 'info');
  }

  initElements() {
    // 設定
    this.serverUrlInput = document.getElementById('serverUrl');
    this.authTokenInput = document.getElementById('authToken');
    this.connectBtn = document.getElementById('connectBtn');
    this.disconnectBtn = document.getElementById('disconnectBtn');

    // コマンド
    this.commandSection = document.getElementById('commandSection');
    this.commandType = document.getElementById('commandType');
    this.commandText = document.getElementById('commandText');
    this.sendCommandBtn = document.getElementById('sendCommandBtn');
    this.micBtn = document.getElementById('micBtn');

    // ステータス
    this.statusEl = document.getElementById('status');
    this.serverStatus = document.getElementById('serverStatus');
    this.lastUpdate = document.getElementById('lastUpdate');
    this.accountCount = document.getElementById('accountCount');

    // ログ
    this.logArea = document.getElementById('logArea');
    this.clearLogBtn = document.getElementById('clearLogBtn');
  }

  bindEvents() {
    this.connectBtn.addEventListener('click', () => this.connect());
    this.disconnectBtn.addEventListener('click', () => this.disconnect());
    this.sendCommandBtn.addEventListener('click', () => this.sendCommand());
    this.clearLogBtn.addEventListener('click', () => this.clearLog());

    // クイックアクション
    document.querySelectorAll('.btn-action').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const command = e.target.dataset.command;
        const text = e.target.dataset.text || '';
        this.sendQuickCommand(command, text);
      });
    });

    // Enterキーでコマンド送信
    this.commandText.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.sendCommand();
      }
    });

    // ページ離脱前に接続を切断
    window.addEventListener('beforeunload', () => {
      if (this.ws) {
        this.ws.close();
      }
    });
  }

  loadSettings() {
    const savedUrl = localStorage.getItem('serverUrl');
    const savedToken = localStorage.getItem('authToken');

    if (savedUrl) this.serverUrlInput.value = savedUrl;
    if (savedToken) this.authTokenInput.value = savedToken;
  }

  saveSettings() {
    localStorage.setItem('serverUrl', this.serverUrlInput.value);
    localStorage.setItem('authToken', this.authTokenInput.value);
  }

  connect() {
    const url = this.serverUrlInput.value.trim();
    const token = this.authTokenInput.value.trim();

    if (!url) {
      this.addLog('エラー: サーバーURLを入力してください', 'error');
      return;
    }

    if (!token) {
      this.addLog('エラー: 認証トークンを入力してください', 'error');
      return;
    }

    this.saveSettings();
    this.updateStatus('connecting', '接続中...');
    this.addLog(`サーバーに接続中: ${url}`, 'info');

    try {
      // WebSocket接続（トークンをクエリパラメータで送信）
      const wsUrl = `${url}?token=${encodeURIComponent(token)}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => this.onOpen();
      this.ws.onmessage = (event) => this.onMessage(event);
      this.ws.onerror = (error) => this.onError(error);
      this.ws.onclose = () => this.onClose();

    } catch (err) {
      this.addLog(`接続エラー: ${err.message}`, 'error');
      this.updateStatus('error', '接続失敗');
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.updateStatus('disconnected', '未接続');
    this.addLog('サーバーから切断しました', 'info');
    this.toggleConnectionUI(false);
  }

  onOpen() {
    this.connected = true;
    this.reconnectAttempts = 0;
    this.updateStatus('connected', '接続完了');
    this.addLog('サーバーに接続しました', 'success');
    this.toggleConnectionUI(true);

    // Ping送信（接続維持）
    this.startPingInterval();
  }

  onMessage(event) {
    try {
      const data = JSON.parse(event.data);
      console.log('Received:', data);

      switch (data.type) {
        case 'connected':
          this.addLog(data.message, 'success');
          if (data.accountsCount !== undefined) {
            this.accountCount.textContent = `${data.accountsCount}件`;
          }
          this.updateLastUpdate();
          break;

        case 'command_result':
          this.handleCommandResult(data.result);
          break;

        case 'command_executed':
          this.addLog(`コマンド実行: ${data.command} - ${data.text || ''}`, 'info');
          break;

        case 'pong':
          // Ping応答
          break;

        case 'error':
          this.addLog(`エラー: ${data.message}`, 'error');
          break;

        default:
          this.addLog(`受信: ${JSON.stringify(data)}`, 'info');
      }
    } catch (err) {
      this.addLog(`メッセージ解析エラー: ${err.message}`, 'error');
    }
  }

  onError(error) {
    console.error('WebSocket error:', error);
    this.addLog('WebSocketエラーが発生しました', 'error');
  }

  onClose() {
    this.connected = false;
    this.stopPingInterval();
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this.addLog(`再接続を試行します (${this.reconnectAttempts}/${this.maxReconnectAttempts})`, 'info');
      this.updateStatus('connecting', '再接続中...');
      
      setTimeout(() => {
        if (!this.connected) {
          this.connect();
        }
      }, this.reconnectDelay);
    } else {
      this.addLog('接続が切断されました', 'error');
      this.updateStatus('error', '切断');
      this.toggleConnectionUI(false);
    }
  }

  sendCommand() {
    if (!this.connected || !this.ws) {
      this.addLog('エラー: サーバーに接続されていません', 'error');
      return;
    }

    const command = this.commandType.value;
    const text = this.commandText.value.trim();

    this.sendQuickCommand(command, text);
    this.commandText.value = '';
  }

  sendQuickCommand(command, text = '') {
    if (!this.connected || !this.ws) {
      this.addLog('エラー: サーバーに接続されていません', 'error');
      return;
    }

    const message = {
      type: 'command',
      command: command,
      text: text,
      timestamp: Date.now()
    };

    this.ws.send(JSON.stringify(message));
    this.addLog(`送信: ${command} - "${text}"`, 'info');
  }

  handleCommandResult(result) {
    if (result.success) {
      this.addLog(`✓ ${result.message || 'コマンド実行成功'}`, 'success');
      
      if (result.results) {
        this.addLog(`検索結果: ${result.count}件`, 'success');
        result.results.forEach((item, index) => {
          this.addLog(`  ${index + 1}. ${item.author}: ${item.text.substring(0, 50)}...`, 'info');
        });
      }
    } else {
      this.addLog(`✗ ${result.message || 'コマンド実行失敗'}`, 'error');
    }
  }

  startPingInterval() {
    this.stopPingInterval();
    this.pingInterval = setInterval(() => {
      if (this.connected && this.ws) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000); // 30秒ごと
  }

  stopPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  updateStatus(state, text) {
    this.statusEl.textContent = text;
    this.statusEl.className = `status ${state}`;
    this.serverStatus.textContent = text;
  }

  updateLastUpdate() {
    const now = new Date();
    this.lastUpdate.textContent = now.toLocaleString('ja-JP');
  }

  toggleConnectionUI(connected) {
    if (connected) {
      this.connectBtn.style.display = 'none';
      this.disconnectBtn.style.display = 'inline-block';
      this.commandSection.style.display = 'block';
      this.serverUrlInput.disabled = true;
      this.authTokenInput.disabled = true;
    } else {
      this.connectBtn.style.display = 'inline-block';
      this.disconnectBtn.style.display = 'none';
      this.commandSection.style.display = 'none';
      this.serverUrlInput.disabled = false;
      this.authTokenInput.disabled = false;
    }
  }

  addLog(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('ja-JP');
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.innerHTML = `<span class="timestamp">[${timestamp}]</span> ${message}`;
    
    this.logArea.appendChild(entry);
    this.logArea.scrollTop = this.logArea.scrollHeight;

    // ログが多すぎる場合は古いものを削除
    const maxLogs = 100;
    while (this.logArea.children.length > maxLogs) {
      this.logArea.removeChild(this.logArea.firstChild);
    }
  }

  clearLog() {
    this.logArea.innerHTML = '';
    this.addLog('ログをクリアしました', 'info');
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js')
        .then(reg => {
          console.log('Service Worker registered:', reg);
        })
        .catch(err => {
          console.log('Service Worker registration failed:', err);
        });
    }
  }
}

// アプリケーション起動
document.addEventListener('DOMContentLoaded', () => {
  window.app = new ForyouController();
});

// PWAインストールプロンプト
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  console.log('PWA install prompt available');
});

window.addEventListener('appinstalled', () => {
  console.log('PWA installed');
  deferredPrompt = null;
});
