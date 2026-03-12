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

    // Read the entire response as text first, then parse
    const fullText = await resp.text();
    console.log('[vercel-ext] Full response length:', fullText.length);
    console.log('[vercel-ext] First 500 chars:', fullText.slice(0, 500));

    let aiText = '';
    for (const line of fullText.split('\n')) {
      if (line.startsWith('0:')) {
        try {
          aiText += JSON.parse(line.slice(2));
        } catch {}
      } else if (line.startsWith('9:')) {
        try {
          const data = JSON.parse(line.slice(2));
          if (data.toolName) showToolUse(data.toolName);
        } catch {}
      }
    }

    console.log('[vercel-ext] Parsed aiText length:', aiText.length);
    console.log('[vercel-ext] aiText:', aiText.slice(0, 200));

    if (aiText) {
      aiEl.textContent = aiText;
      messages.push({ role: 'assistant', content: aiText });
    } else {
      aiEl.textContent = '🤔 No text in response. Check console for debug info.';
      console.log('[vercel-ext] NO TEXT FOUND. Full response:', fullText);
    }
  } catch (e) {
    aiEl.textContent = '❌ ' + e.message;
    console.error('[vercel-ext] Error:', e);
    messages.pop();
  }

  sendBtn.disabled = false;
  input.disabled = false;
  input.focus();
}
