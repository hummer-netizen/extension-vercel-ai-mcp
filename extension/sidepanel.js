var API_URL = browser.webfuseSession.env.API_URL || 'https://vercel-ai-mcp.webfuse.it';
var HN_MAIN = 'https://news.ycombinator.com';
var messagesEl = document.getElementById('messages');
var input = document.getElementById('input');
var sendBtn = document.getElementById('send');

var messages = [];
var sessionId = null;
var currentPageUrl = HN_MAIN;
var busy = false;

(async function() {
  try {
    var info = await browser.webfuseSession.getSessionInfo();
    sessionId = info.sessionId;
  } catch (e) {
    addMessage('ai', '⚠️ Could not connect to session.');
  }
})();

input.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

// Listen for navigation events from content.js
browser.runtime.onMessage.addListener(function(msg) {
  if (msg.type === 'navigation' && msg.url) {
    currentPageUrl = msg.url;
    handleNavigation(msg.url);
  }
});

function handleNavigation(url) {
  if (busy) return; // don't interrupt an active request

  // HN comments page: auto-summarize comments
  if (url.match(/news\.ycombinator\.com\/item\?id=\d+/)) {
    autoSummarize('Read the comments using root selector ".comment-tree" with quality 0.3. Summarize them grouped by theme. Highlight the most insightful or controversial takes. Keep it concise.');
  }
  // Non-HN page or HN subpage (not main): auto-summarize
  else if (!url.match(/news\.ycombinator\.com\/?$/) && !url.match(/news\.ycombinator\.com\/news/)) {
    autoSummarize('Read this page with root selector "article" or "main" or "body" at quality 0.3 and give me a concise summary.');
  }
}

function autoSummarize(prompt) {
  if (!sessionId || busy) return;
  // Reset conversation for fresh context on new page
  messages = [];
  // Small delay to let the page load
  setTimeout(function() {
    input.value = prompt;
    sendMessage();
  }, 1500);
}

function askExample(el) {
  var text = el.dataset.prompt || el.textContent;
  // For HN front-page chips, ensure we're on the main page
  if (el.dataset.home === 'true' && !currentPageUrl.match(/news\.ycombinator\.com\/?$/)) {
    text = 'First navigate to ' + HN_MAIN + ', then: ' + text;
  }
  messages = [];
  input.value = text;
  sendMessage();
}

// Lightweight markdown → HTML
function mdToHtml(md) {
  var html = md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<strong>$1</strong>')
    .replace(/^## (.+)$/gm, '<strong>$1</strong>')
    .replace(/^# (.+)$/gm, '<strong style="font-size:1.1em">$1</strong>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(_, t, u) {
      return '<a href="' + u + '" onclick="event.preventDefault();window.open(\'' + u + '\',\'_blank\')">' + t + '</a>';
    })
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^---+$/gm, '<hr>')
    .replace(/\n/g, '<br>');

  // Numbered lists
  html = html.replace(/((?:^|\<br\>)\d+\.\s.+(?:\<br\>\d+\.\s.+)*)/g, function(block) {
    var items = block.split('<br>').filter(function(l) { return l.match(/^\d+\.\s/); });
    if (!items.length) return block;
    return '<ol>' + items.map(function(i) { return '<li>' + i.replace(/^\d+\.\s/, '') + '</li>'; }).join('') + '</ol>';
  });

  // Bullet lists
  html = html.replace(/((?:^|\<br\>)[\-\*]\s.+(?:\<br\>[\-\*]\s.+)*)/g, function(block) {
    var items = block.split('<br>').filter(function(l) { return l.match(/^[\-\*]\s/); });
    if (!items.length) return block;
    return '<ul>' + items.map(function(i) { return '<li>' + i.replace(/^[\-\*]\s/, '') + '</li>'; }).join('') + '</ul>';
  });

  return html;
}

function addMessage(role, content) {
  var el = document.createElement('div');
  el.className = 'msg ' + role;
  if (role === 'ai' && content) {
    el.innerHTML = mdToHtml(content);
  } else {
    el.textContent = content;
  }
  messagesEl.appendChild(el);
  requestAnimationFrame(function() { messagesEl.scrollTop = messagesEl.scrollHeight; });
  return el;
}

function showToolUse(toolName) {
  var names = {
    see_domSnapshot: 'reading the page…',
    act_click: 'clicking…',
    act_type: 'typing…',
    act_keyPress: 'pressing key…',
    act_scroll: 'scrolling…',
    navigate: 'navigating…',
    wait: 'waiting…',
  };
  var el = document.createElement('div');
  el.className = 'msg tool';
  el.textContent = names[toolName] || ('🔧 ' + toolName);
  messagesEl.appendChild(el);
  requestAnimationFrame(function() { messagesEl.scrollTop = messagesEl.scrollHeight; });
}

async function sendMessage() {
  var text = input.value.trim();
  if (!text || !sessionId || busy) return;

  busy = true;
  input.value = '';
  sendBtn.disabled = true;
  input.disabled = true;
  addMessage('user', text);
  messages.push({ role: 'user', content: text });

  var aiEl = null;

  try {
    var resp = await fetch(API_URL + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messages, sessionId: sessionId }),
    });

    if (!resp.ok) {
      var errText = '';
      try { errText = await resp.text(); } catch(e2) { errText = resp.statusText; }
      throw new Error('Server error ' + resp.status + ': ' + errText.slice(0, 200));
    }

    var contentType = resp.headers.get('content-type') || '';

    if (contentType.includes('text/event-stream')) {
      var reader = resp.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';

      while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        var lines = buffer.split('\n');
        buffer = lines.pop();

        for (var i = 0; i < lines.length; i++) {
          var line = lines[i];
          if (!line.startsWith('data: ')) continue;
          try {
            var ev = JSON.parse(line.slice(6));
            if (ev.type === 'tool') {
              showToolUse(ev.name);
            } else if (ev.type === 'text') {
              aiEl = addMessage('ai', ev.content);
              messages.push({ role: 'assistant', content: ev.content });
            } else if (ev.type === 'error') {
              addMessage('ai', '❌ ' + ev.content);
              messages.pop();
            }
          } catch (_) {}
        }
      }

      if (!aiEl) {
        addMessage('ai', '🤔 No response. Try again.');
        messages.pop();
      }
    } else {
      var data = await resp.json();
      if (data.toolNames) {
        data.toolNames.forEach(function(t) { showToolUse(t); });
      }
      if (data.text) {
        addMessage('ai', data.text);
        messages.push({ role: 'assistant', content: data.text });
      } else {
        addMessage('ai', '🤔 No response.');
        messages.pop();
      }
    }
  } catch (e) {
    addMessage('ai', '❌ ' + e.message);
    messages.pop();
  }

  busy = false;
  sendBtn.disabled = false;
  input.disabled = false;
  input.focus();
}
