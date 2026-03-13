const API_URL = browser.webfuseSession.env.API_URL || 'https://vercel-ai-mcp.webfuse.it';
const HN_URL = 'https://news.ycombinator.com';
const messagesEl = document.getElementById('messages');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');

let messages = [];
let sessionId = null;
let currentUrl = HN_URL;

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
  // Reset messages so auto-read fires fresh on HN
  messages = [];
  sendMessage();
}

function addMessage(role, text) {
  var el = document.createElement('div');
  el.className = 'msg ' + role;
  el.textContent = text;
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

  // Placeholder for AI response — will be replaced when text arrives
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

    // Check if streaming (SSE) or JSON
    var contentType = resp.headers.get('content-type') || '';

    if (contentType.includes('text/event-stream')) {
      // SSE streaming — tools appear in real-time, text comes last
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
              aiEl = addMessage('ai', '❌ ' + ev.content);
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
      // JSON fallback (old format)
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
