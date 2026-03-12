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
    addMessage('ai', '👋 Ready! Ask me to do anything on this page.');
  } catch (e) {
    addMessage('ai', '⚠️ Could not connect to Webfuse session.');
  }
})();

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

function addMessage(role, text) {
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  el.textContent = text;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return el;
}

function showToolUse(toolName) {
  const names = {
    see_domSnapshot: '👁️ Reading page',
    see_accessibilityTree: '🌳 Reading structure',
    act_click: '👆 Clicking', act_type: '⌨️ Typing',
    act_keyPress: '⌨️ Pressing key', act_scroll: '📜 Scrolling',
    act_mouseMove: '🖱️ Hovering', act_select: '📋 Selecting',
    act_textSelect: '✏️ Highlighting', navigate: '🧭 Navigating',
    wait: '⏳ Waiting',
  };
  const el = document.createElement('div');
  el.className = 'msg tool';
  el.textContent = names[toolName] || `🔧 ${toolName}`;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Parse Vercel AI SDK data stream — newlines may be stripped by proxy
function parseDataStream(text) {
  let aiText = '';
  const toolNames = [];

  // Match 0:"..." text tokens (the value is a JSON string)
  const textRegex = /(?:^|\n|})0:((?:"(?:[^"\\]|\\.)*")|(?:\{[^}]*\}))/g;
  let m;
  while ((m = textRegex.exec(text)) !== null) {
    try {
      aiText += JSON.parse(m[1]);
    } catch {}
  }

  // Match 9:{...} tool call events
  const toolRegex = /9:(\{[^}]+\})/g;
  while ((m = toolRegex.exec(text)) !== null) {
    try {
      const data = JSON.parse(m[1]);
      if (data.toolName) toolNames.push(data.toolName);
    } catch {}
  }

  return { aiText, toolNames };
}

async function sendMessage() {
  const text = input.value.trim();
  if (!text) return;
  if (!sessionId) { addMessage('ai', '⚠️ No active session.'); return; }

  input.value = '';
  sendBtn.disabled = true;
  input.disabled = true;
  addMessage('user', text);
  messages.push({ role: 'user', content: text });

  const aiEl = addMessage('ai', '');
  aiEl.innerHTML = '<span class="typing">Thinking…</span>';

  try {
    const resp = await fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, sessionId }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => resp.statusText);
      throw new Error(`Server error ${resp.status}: ${errText.slice(0, 200)}`);
    }

    const fullText = await resp.text();
    const { aiText, toolNames } = parseDataStream(fullText);

    // Show tool indicators
    toolNames.forEach(t => showToolUse(t));

    if (aiText) {
      aiEl.textContent = aiText;
      messages.push({ role: 'assistant', content: aiText });
    } else {
      aiEl.textContent = '🤔 No response text found. The AI may have only used tools.';
      console.log('[vercel-ext] No text. Response length:', fullText.length);
      console.log('[vercel-ext] First 1000:', fullText.slice(0, 1000));
    }
  } catch (e) {
    aiEl.textContent = '❌ ' + e.message;
    messages.pop();
  }

  sendBtn.disabled = false;
  input.disabled = false;
  input.focus();
}
