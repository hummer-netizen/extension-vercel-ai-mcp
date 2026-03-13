const API_URL = browser.webfuseSession.env.API_URL || 'https://vercel-ai-mcp.webfuse.it';
const messagesEl = document.getElementById('messages');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');

let messages = [];
let sessionId = null;

(async () => {
  try {
    const info = await browser.webfuseSession.getSessionInfo();
    sessionId = info.sessionId;
  } catch (e) {
    addMessage('ai', '⚠️ Could not connect to session.');
  }
})();

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

function askExample(el) {
  input.value = el.textContent;
  messages = [];
  sendMessage();
}

// Lightweight markdown → HTML
function mdToHtml(md) {
  var html = md
    // Escape HTML first
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Headers
    .replace(/^### (.+)$/gm, '<strong>$1</strong>')
    .replace(/^## (.+)$/gm, '<strong>$1</strong>')
    .replace(/^# (.+)$/gm, '<strong style="font-size:1.1em">$1</strong>')
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Links: [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" onclick="event.preventDefault();window.open(\'$2\',\'_blank\')" style="color:#ff6600">$1</a>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code style="background:#f0f0f0;padding:1px 3px;border-radius:2px;font-size:0.9em">$1</code>')
    // Horizontal rule
    .replace(/^---+$/gm, '<hr style="border:none;border-top:1px solid #e0d8d0;margin:6px 0">')
    // Line breaks
    .replace(/\n/g, '<br>');

  // Convert numbered lists: lines starting with "1. ", "2. " etc
  html = html.replace(/((?:^|\<br\>)\d+\.\s.+(?:\<br\>\d+\.\s.+)*)/g, function(block) {
    var items = block.split('<br>').filter(function(l) { return l.match(/^\d+\.\s/); });
    if (items.length === 0) return block;
    var ol = '<ol style="margin:4px 0;padding-left:20px">';
    items.forEach(function(item) {
      ol += '<li>' + item.replace(/^\d+\.\s/, '') + '</li>';
    });
    ol += '</ol>';
    return ol;
  });

  // Convert bullet lists: lines starting with "- " or "* "
  html = html.replace(/((?:^|\<br\>)[\-\*]\s.+(?:\<br\>[\-\*]\s.+)*)/g, function(block) {
    var items = block.split('<br>').filter(function(l) { return l.match(/^[\-\*]\s/); });
    if (items.length === 0) return block;
    var ul = '<ul style="margin:4px 0;padding-left:20px">';
    items.forEach(function(item) {
      ul += '<li>' + item.replace(/^[\-\*]\s/, '') + '</li>';
    });
    ul += '</ul>';
    return ul;
  });

  return html;
}

function addMessage(role, content) {
  var el = document.createElement('div');
  el.className = 'msg ' + role;
  if (role === 'ai') {
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
  if (!text) return;
  if (!sessionId) { addMessage('ai', '⚠️ No active session.'); return; }

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

  sendBtn.disabled = false;
  input.disabled = false;
  input.focus();
}
