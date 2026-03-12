const API_URL = browser.webfuseSession.env.API_URL || 'https://vercel-ai-mcp.webfuse.it';
const messagesEl = document.getElementById('messages');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');
const examplesEl = document.getElementById('examples');

let messages = [];
let sessionId = null;

(async () => {
  try {
    const info = await browser.webfuseSession.getSessionInfo();
    sessionId = info.sessionId;
  } catch (e) {
    addMessage('ai', '\u26a0\ufe0f Could not connect to Webfuse session.');
  }
})();

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

function askExample(el) {
  input.value = el.textContent;
  sendMessage();
}

function addMessage(role, text) {
  const el = document.createElement('div');
  el.className = 'msg ' + role;
  el.textContent = text;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return el;
}

function showToolUse(toolName) {
  var names = {
    see_domSnapshot: '\ud83d\udc41\ufe0f Reading page',
    act_click: '\ud83d\udc46 Clicking',
    act_type: '\u2328\ufe0f Typing',
    act_keyPress: '\u2328\ufe0f Pressing key',
    act_scroll: '\ud83d\udcdc Scrolling',
    navigate: '\ud83e\udded Navigating',
    wait: '\u23f3 Waiting',
  };
  var el = document.createElement('div');
  el.className = 'msg tool';
  el.textContent = names[toolName] || ('\ud83d\udd27 ' + toolName);
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function sendMessage() {
  var text = input.value.trim();
  if (!text) return;
  if (!sessionId) { addMessage('ai', '\u26a0\ufe0f No active session.'); return; }

  // Hide examples after first message
  if (examplesEl) examplesEl.style.display = 'none';

  input.value = '';
  sendBtn.disabled = true;
  input.disabled = true;
  addMessage('user', text);
  messages.push({ role: 'user', content: text });

  var aiEl = addMessage('ai', '');
  aiEl.innerHTML = '<span class="typing">Thinking\u2026</span>';

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

    var data = await resp.json();

    // Show tool indicators
    if (data.toolNames) {
      data.toolNames.forEach(function(t) { showToolUse(t); });
    }

    if (data.text) {
      aiEl.textContent = data.text;
      messages.push({ role: 'assistant', content: data.text });
    } else if (data.error) {
      aiEl.textContent = '\u274c ' + data.error;
      messages.pop();
    } else {
      aiEl.textContent = '\ud83e\udd14 No response. Try again or ask differently.';
      messages.pop();
    }
  } catch (e) {
    aiEl.textContent = '\u274c ' + e.message;
    messages.pop();
  }

  sendBtn.disabled = false;
  input.disabled = false;
  input.focus();
}
