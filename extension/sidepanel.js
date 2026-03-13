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
    see_domSnapshot: 'reading the page...',
    act_click: 'clicking something...',
    act_type: 'typing away...',
    act_keyPress: 'pressing keys...',
    act_scroll: 'scrolling...',
    navigate: 'navigating...',
    wait: 'waiting...',
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

  // Collapse chips after first message, show toggle
  if (examplesEl && examplesEl.style.display !== 'none') {
    var chipList = document.getElementById('chipList');
    var chipToggle = document.getElementById('chipToggle');
    if (chipList) chipList.style.display = 'none';
    if (chipToggle) chipToggle.style.display = 'block';
  }

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


function showChips() {
  var chipList = document.getElementById('chipList');
  var chipToggle = document.getElementById('chipToggle');
  if (chipList) chipList.style.display = '';
  if (chipToggle) chipToggle.style.display = 'none';
}
window.showChips = showChips;
