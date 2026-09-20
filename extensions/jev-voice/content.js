// コンテンツスクリプト - Webページに注入される

console.log('Jev Voice Browser コンテンツスクリプトが読み込まれました');

// メッセージリスナー
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('コンテンツスクリプトがメッセージを受信:', message);
  
  switch (message.type) {
    case 'execute_dom_action':
      executeDOMAction(message.action, message.selector, message.value)
        .then(result => sendResponse({ success: true, result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'get_page_info':
      const pageInfo = getPageInfo();
      sendResponse({ success: true, info: pageInfo });
      break;
      
    case 'get_clickable_elements':
      const elements = getClickableElements();
      sendResponse({ success: true, elements });
      break;
      
    case 'highlight_element':
      highlightElement(message.selector);
      sendResponse({ success: true });
      break;
      
    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }
});

// DOM操作の実行
async function executeDOMAction(action, selector, value) {
  console.log('DOM操作を実行:', action, selector, value);
  
  const element = selector ? document.querySelector(selector) : null;
  
  switch (action) {
    case 'click':
      if (!element) {
        throw new Error(`要素が見つかりません: ${selector}`);
      }
      element.click();
      await waitForNavigation();
      return { message: '要素をクリックしました' };
      
    case 'type':
      if (!element) {
        throw new Error(`要素が見つかりません: ${selector}`);
      }
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        element.value = value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        element.textContent = value;
      }
      return { message: 'テキストを入力しました' };
      
    case 'scroll':
      const scrollY = parseInt(value) || 0;
      window.scrollBy({ top: scrollY, behavior: 'smooth' });
      return { message: 'スクロールしました' };
      
    case 'navigate':
      window.location.href = value;
      await waitForNavigation();
      return { message: 'ページ遷移しました' };
      
    case 'back':
      window.history.back();
      await waitForNavigation();
      return { message: '前のページに戻りました' };
      
    case 'forward':
      window.history.forward();
      await waitForNavigation();
      return { message: '次のページに進みました' };
      
    default:
      throw new Error(`未知のアクション: ${action}`);
  }
}

// ページ情報の取得
function getPageInfo() {
  return {
    url: window.location.href,
    title: document.title,
    domain: window.location.hostname,
    html: document.documentElement.outerHTML,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY
    }
  };
}

// クリック可能な要素の取得
function getClickableElements() {
  const selectors = [
    'a[href]',
    'button',
    'input[type="button"]',
    'input[type="submit"]',
    'input[type="reset"]',
    '[role="button"]',
    '[onclick]',
    'select',
    'input[type="checkbox"]',
    'input[type="radio"]'
  ];
  
  const elements = [];
  const selector = selectors.join(', ');
  const nodes = document.querySelectorAll(selector);
  
  nodes.forEach((el, index) => {
    // 可視性チェック
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    
    if (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== 'hidden' &&
      style.display !== 'none'
    ) {
      const info = {
        index,
        tag: el.tagName,
        type: el.type || null,
        text: el.textContent?.trim().substring(0, 100) || '',
        id: el.id || null,
        className: el.className || null,
        href: el.href || null,
        rect: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height
        },
        selector: generateSelector(el)
      };
      
      elements.push(info);
    }
  });
  
  return elements;
}

// 要素のセレクターを生成
function generateSelector(element) {
  if (element.id) {
    return `#${element.id}`;
  }
  
  if (element.className) {
    const classes = Array.from(element.classList)
      .filter(c => c && !c.startsWith('ng-') && !c.startsWith('_'))
      .slice(0, 2)
      .join('.');
    
    if (classes) {
      return `${element.tagName.toLowerCase()}.${classes}`;
    }
  }
  
  // パスベースのセレクター
  const path = [];
  let current = element;
  
  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();
    
    if (current.id) {
      selector += `#${current.id}`;
      path.unshift(selector);
      break;
    }
    
    const siblings = Array.from(current.parentNode?.children || []);
    const index = siblings.indexOf(current);
    
    if (index > 0 || siblings.length > 1) {
      selector += `:nth-child(${index + 1})`;
    }
    
    path.unshift(selector);
    current = current.parentElement;
  }
  
  return path.join(' > ');
}

// 要素のハイライト
function highlightElement(selector) {
  // 既存のハイライトを削除
  document.querySelectorAll('.jev-voice-highlight').forEach(el => {
    el.classList.remove('jev-voice-highlight');
  });
  
  const element = document.querySelector(selector);
  if (element) {
    element.classList.add('jev-voice-highlight');
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // スタイルを追加（まだない場合）
    if (!document.getElementById('jev-voice-highlight-style')) {
      const style = document.createElement('style');
      style.id = 'jev-voice-highlight-style';
      style.textContent = `
        .jev-voice-highlight {
          outline: 3px solid #7dd3a8 !important;
          outline-offset: 2px !important;
          background-color: rgba(125, 211, 168, 0.1) !important;
          transition: all 0.3s ease !important;
        }
      `;
      document.head.appendChild(style);
    }
    
    // 3秒後にハイライトを削除
    setTimeout(() => {
      element.classList.remove('jev-voice-highlight');
    }, 3000);
  }
}

// ナビゲーション待機
function waitForNavigation() {
  return new Promise((resolve) => {
    if (document.readyState === 'complete') {
      resolve();
    } else {
      window.addEventListener('load', () => resolve(), { once: true });
    }
  });
}

// ページ読み込み完了時の処理
if (document.readyState === 'complete') {
  console.log('ページが完全に読み込まれました');
} else {
  window.addEventListener('load', () => {
    console.log('ページが完全に読み込まれました');
  });
}

// DOMの変更を監視（オプション）
const observer = new MutationObserver((mutations) => {
  // 必要に応じてDOM変更時の処理を追加
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: false
});

console.log('コンテンツスクリプトの初期化が完了しました');
