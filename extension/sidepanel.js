const API_URL = browser.webfuseSession.env.API_URL || 'https://vercel-ai-mcp.webfuse.it';
const messagesEl = document.getElementById('messages');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');

let messages = [];
let sessionId = null;

// Get session ID on load
(async () => {
  try {
    const info = await browser.webfuseSession.getSessionInfo();
    sessionId = info.sessionId;
    addMessage('ai', '👋 Ready! Ask me to do anything on this page.');
  } catch (e) {
    addMessage('ai', '❌ Could not connect to session: ' + e.message);
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
  const el = document.createElement('div');
  el.className = 'msg tool';
  el.textContent = `🔧 Using ${toolName}...`;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return el;
}

async function sendMessage() {
  const text = input.value.trim();
  if (!text || !sessionId) return;

  input.value = '';
  sendBtn.disabled = true;
  addMessage('user', text);
  messages.push({ role: 'user', content: text });

  const aiEl = addMessage('ai', '...');

  try {
    const resp = await fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, sessionId }),
    });

    if (!resp.ok) {
      throw new Error(`Server error: ${resp.status}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let aiText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });

      // Parse Vercel AI SDK data stream format
      for (const line of chunk.split('\n')) {
        if (line.startsWith('0:')) {
          // Text delta
          try {
            aiText += JSON.parse(line.slice(2));
            aiEl.textContent = aiText;
            messagesEl.scrollTop = messagesEl.scrollHeight;
          } catch {}
        } else if (line.startsWith('9:')) {
          // Tool call — show indicator
          try {
            const data = JSON.parse(line.slice(2));
            if (data.toolName) showToolUse(data.toolName);
          } catch {}
        }
      }
    }

    if (aiText) {
      messages.push({ role: 'assistant', content: aiText });
    } else {
      aiEl.textContent = '(No response — the AI may have only used tools)';
    }
  } catch (e) {
    aiEl.textContent = '❌ ' + e.message;
  }

  sendBtn.disabled = false;
  input.focus();
}
