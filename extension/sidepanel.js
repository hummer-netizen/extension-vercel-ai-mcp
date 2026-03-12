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
    act_click: '👆 Clicking',
    act_type: '⌨️ Typing',
    act_keyPress: '⌨️ Pressing key',
    act_scroll: '📜 Scrolling',
    act_mouseMove: '🖱️ Hovering',
    act_select: '📋 Selecting',
    act_textSelect: '✏️ Highlighting',
    navigate: '🧭 Navigating',
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
  if (!sessionId) {
    addMessage('ai', '⚠️ No active session.');
    return;
  }

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

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let aiText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Process complete lines only, keep incomplete last line in buffer
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep the incomplete line

      for (const line of lines) {
        if (line.startsWith('0:')) {
          try {
            aiText += JSON.parse(line.slice(2));
            aiEl.textContent = aiText;
            messagesEl.scrollTop = messagesEl.scrollHeight;
          } catch {}
        } else if (line.startsWith('9:')) {
          try {
            const data = JSON.parse(line.slice(2));
            if (data.toolName) showToolUse(data.toolName);
          } catch {}
        }
      }
    }

    // Process any remaining buffer
    if (buffer) {
      if (buffer.startsWith('0:')) {
        try {
          aiText += JSON.parse(buffer.slice(2));
          aiEl.textContent = aiText;
        } catch {}
      }
    }

    if (aiText) {
      messages.push({ role: 'assistant', content: aiText });
    } else {
      aiEl.textContent = '🤔 No response. The AI may have used tools but couldn\'t formulate an answer. Try asking again.';
    }
  } catch (e) {
    aiEl.textContent = '❌ ' + e.message;
    messages.pop();
  }

  sendBtn.disabled = false;
  input.disabled = false;
  input.focus();
}
