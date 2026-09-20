// サービスワーカー - バックグラウンドで動作

console.log('Jev Voice Browser サービスワーカーが起動しました');

// 拡張機能のインストール時
chrome.runtime.onInstalled.addListener((details) => {
  console.log('拡張機能がインストールされました:', details.reason);
  
  if (details.reason === 'install') {
    // 初回インストール時の処理
    console.log('初回インストール');
    
    // サイドパネルを有効化
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});

// アクションボタンクリック時（拡張機能アイコンクリック）
chrome.action.onClicked.addListener(async (tab) => {
  console.log('アクションボタンがクリックされました', tab.id);
  
  // サイドパネルを開く
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
    console.log('サイドパネルを開きました');
  } catch (error) {
    console.error('サイドパネルを開けませんでした:', error);
  }
});

// メッセージリスナー（コンテンツスクリプトやサイドパネルからのメッセージを処理）
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('メッセージを受信:', message);
  
  switch (message.type) {
    case 'execute_action':
      handleExecuteAction(message.data, sender.tab?.id)
        .then(result => sendResponse({ success: true, result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // 非同期レスポンスを使用
      
    case 'get_tab_info':
      getTabInfo(sender.tab?.id || message.tabId)
        .then(info => sendResponse({ success: true, info }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'capture_screenshot':
      captureScreenshot(sender.tab?.id || message.tabId)
        .then(screenshot => sendResponse({ success: true, screenshot }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }
});

// アクション実行
async function handleExecuteAction(data, tabId) {
  console.log('アクションを実行:', data, 'タブ:', tabId);
  
  const { action, selector, value } = data;
  
  if (!tabId) {
    throw new Error('タブIDが指定されていません');
  }
  
  // コンテンツスクリプトにアクションを転送
  const result = await chrome.tabs.sendMessage(tabId, {
    type: 'execute_dom_action',
    action,
    selector,
    value
  });
  
  return result;
}

// タブ情報の取得
async function getTabInfo(tabId) {
  if (!tabId) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tab?.id;
  }
  
  if (!tabId) {
    throw new Error('タブが見つかりません');
  }
  
  const tab = await chrome.tabs.get(tabId);
  
  return {
    id: tab.id,
    url: tab.url,
    title: tab.title,
    favIconUrl: tab.favIconUrl,
    status: tab.status
  };
}

// スクリーンショットの取得
async function captureScreenshot(tabId) {
  if (!tabId) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tab?.id;
  }
  
  if (!tabId) {
    throw new Error('タブが見つかりません');
  }
  
  // タブを有効にする
  await chrome.tabs.update(tabId, { active: true });
  
  // スクリーンショットを取得
  const screenshot = await chrome.tabs.captureVisibleTab(null, {
    format: 'png',
    quality: 90
  });
  
  return screenshot;
}

// タブの更新を監視
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    console.log('タブの読み込みが完了しました:', tab.url);
  }
});

// コンテキストメニューの追加
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'jev-voice-panel',
    title: 'Jev Voice パネルを開く',
    contexts: ['page', 'selection']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'jev-voice-panel') {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
      
      // 選択されたテキストがあれば、サイドパネルに送信
      if (info.selectionText) {
        // ストレージに一時保存
        await chrome.storage.session.set({
          selectedText: info.selectionText
        });
      }
    } catch (error) {
      console.error('サイドパネルを開けませんでした:', error);
    }
  }
});

// エラーハンドリング
self.addEventListener('error', (event) => {
  console.error('サービスワーカーエラー:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('未処理のPromise拒否:', event.reason);
});

console.log('サービスワーカーの初期化が完了しました');
