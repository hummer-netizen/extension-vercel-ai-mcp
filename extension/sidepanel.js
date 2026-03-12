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
    act_click: '👆 Clicking', act_type: '⌨️ Typing',
    act_keyPress: '⌨️ Pressing key', act_scroll: '📜 Scrolling',
    navigate: '🧭 Navigating', wait: '⏳ Waiting',
  };
  const el = document.createElement('div');
  el.className = 'msg tool';
  el.textContent = names[toolName] || `🔧 ${toolName}`;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Parse Vercel AI SDK data stream — proxy strips newlines
function parseDataStream(text) {
  let aiText = '';
  const toolNames = [];

  // Find all 0:"..." text tokens
  // They appear as: }0:"text" or "0:"text" or \n0:"text"
  // Use a simple approach: find every 0:" and parse the JSON string after it
  let idx = 0;
  while (idx < text.length) {
    // Find next 0:" pattern
    const pos = text.indexOf('0:"', idx);
    if (pos === -1) break;

    // Make sure this is a stream prefix, not inside a JSON value
    // Check that char before is }, ", \n, or start of string
    if (pos > 0) {
      const prev = text[pos - 1];
      if (prev !== '}' && prev !== '"' && prev !== '\n' && prev !== ')') {
        idx = pos + 3;
        continue;
      }
    }

    // Extract the JSON string starting at the "
    const strStart = pos + 2; // points to opening "
    // Find the closing " (handle escaped quotes)
    let j = strStart + 1;
    while (j < text.length) {
      if (text[j] === '\\') { j += 2; continue; }
      if (text[j] === '"') break;
      j++;
    }
    if (j < text.length) {
      const jsonStr = text.slice(strStart, j + 1);
      try {
        aiText += JSON.parse(jsonStr);
      } catch {}
      idx = j + 1;
    } else {
      break;
    }
  }

  // Find 9:{...toolName...} tool events
  const toolRegex = /9:\{"toolCallId":"[^"]*","toolName":"([^"]*)"/g;
  let m;
  while ((m = toolRegex.exec(text)) !== null) {
    toolNames.push(m[1]);
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

    toolNames.forEach(t => showToolUse(t));

    if (aiText) {
      aiEl.textContent = aiText;
      messages.push({ role: 'assistant', content: aiText });
    } else {
      aiEl.textContent = '🤔 No response. Try again or ask differently.';
      console.log('[vercel-ext] No text. Length:', fullText.length);
      // Log area around where 0: should appear (after last e: line)
      const lastE = fullText.lastIndexOf('e:{');
      if (lastE > -1) {
        console.log('[vercel-ext] Around last e:', fullText.slice(lastE, lastE + 300));
      }
    }
  } catch (e) {
    aiEl.textContent = '❌ ' + e.message;
    messages.pop();
  }

  sendBtn.disabled = false;
  input.disabled = false;
  input.focus();
}
