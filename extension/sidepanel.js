const API_URL = browser.webfuseSession.env.API_URL || 'http://localhost:3001';
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
    addMessage('ai', '⚠️ Could not connect to Webfuse session. Make sure you\'re in an active session.');
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
  // Friendly tool name mapping
  const names = {
    see_domSnapshot: '👁️ Reading page structure',
    see_guiSnapshot: '📸 Taking screenshot',
    see_accessibilityTree: '🌳 Reading accessibility tree',
    see_textSelection: '📋 Reading selected text',
    act_click: '👆 Clicking',
    act_type: '⌨️ Typing',
    act_keyPress: '⌨️ Pressing key',
    act_scroll: '📜 Scrolling',
    act_mouseMove: '🖱️ Moving mouse',
    act_select: '📋 Selecting option',
    act_textSelect: '✏️ Highlighting text',
    navigate: '🧭 Navigating',
    wait: '⏳ Waiting',
  };
  const el = document.createElement('div');
  el.className = 'msg tool';
  el.textContent = names[toolName] || `🔧 ${toolName}`;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return el;
}

async function sendMessage() {
  const text = input.value.trim();
  if (!text) return;
  if (!sessionId) {
    addMessage('ai', '⚠️ No active session. Open your Webfuse Space first.');
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
      throw new Error(`Server error ${resp.status}: ${errText.slice(0, 100)}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let aiText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });

      for (const line of chunk.split('\n')) {
        if (line.startsWith('0:')) {
          // Text delta
          try {
            aiText += JSON.parse(line.slice(2));
            aiEl.textContent = aiText;
            messagesEl.scrollTop = messagesEl.scrollHeight;
          } catch {}
        } else if (line.startsWith('9:')) {
          // Tool call
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
      aiEl.textContent = '✅ Done! (The AI used browser tools but had nothing to say.)';
    }
  } catch (e) {
    aiEl.textContent = '❌ ' + e.message;
    // Remove the failed message so user can retry
    messages.pop();
  }

  sendBtn.disabled = false;
  input.disabled = false;
  input.focus();
}
