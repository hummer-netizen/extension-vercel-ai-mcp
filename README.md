# Vercel AI SDK + Webfuse MCP

A Next.js chat app where the AI controls your browser. Built with the [Vercel AI SDK](https://sdk.vercel.ai/) and [Webfuse Session MCP](https://dev.webfu.se/session-mcp-server/).

**Live demo:** [webfu.se/+vercel-ai-mcp/](https://webfu.se/+vercel-ai-mcp/)

## What It Does

A chat interface in a Webfuse extension sidebar. Type a message, and the AI reads the page, clicks links, fills forms, takes screenshots, and reports back. All conversational, all streaming, all in your browser.

## Architecture

```
Webfuse Extension (sidebar)     Next.js API Route
+--------------------+          +----------------------------+
|  Chat UI           |--POST--->|  /api/chat                 |
|  User messages     |          |                            |
|                    |          |  createMCPClient() -------->  session-mcp.webfu.se
|  AI responses      |<-stream-|  streamText()      <-tools--  13 browser tools
+--------------------+          +----------------------------+
```

The API route connects to Webfuse's Session MCP Server, auto-discovers all 13 browser tools, and uses the Vercel AI SDK's `streamText()` to chain up to 10 tool calls per message.

## Prerequisites

- Node.js 18+
- An [OpenAI](https://platform.openai.com) API key
- A [Webfuse](https://webfuse.com) account with a Space
- The Automation App installed on your Space

## Quick Start

```bash
npm install
cp .env.example .env           # Add your keys
npm run dev                    # Starts on port 3000
```

Deploy the `extension/` folder as a Webfuse extension on your Space. Set the `API_URL` env var to your server URL.

## Configuration

| Variable | Description | Where to get it |
|----------|-------------|----------------|
| `OPENAI_API_KEY` | LLM API key | [platform.openai.com](https://platform.openai.com) |
| `WEBFUSE_REST_KEY` | Space REST API key (`rk_...`) | Webfuse dashboard > Space > API Keys |
| `API_URL` | Next.js server URL (extension env) | Your server URL or Cloudflare tunnel |

**Swap the model in one line:**

```typescript
openai("gpt-4o")              // OpenAI (default)
anthropic("claude-sonnet-4-20250514")  // Anthropic
google("gemini-2.0-flash")    // Google
```

## How It Works

The entire backend is one API route (`app/api/chat/route.ts`):

```typescript
const mcpClient = await createMCPClient({
  transport: new StreamableHTTPClientTransport(
    new URL("https://session-mcp.webfu.se/mcp"),
    { requestInit: { headers: { Authorization: `Bearer ${restKey}` } } }
  ),
});
const tools = await mcpClient.tools();  // 13 browser tools, auto-discovered
const result = streamText({ model: openai("gpt-4o"), messages, tools, maxSteps: 10 });
```

**Stack:** Next.js 15, Vercel AI SDK 4, `@modelcontextprotocol/sdk`, Webfuse Extension sidebar.

**Files:**

```
app/                   Next.js app (API route + layout)
extension/             Webfuse extension (sidebar chat UI)
worker/                Cloudflare Worker (optional proxy)
```

## Links

- [Webfuse](https://webfuse.com)
- [Session MCP Server docs](https://dev.webfu.se/session-mcp-server/)
- [Vercel AI SDK docs](https://sdk.vercel.ai/docs)

## Other Webfuse Integrations

- [OpenAI Agents SDK](https://github.com/webfuse-com/extension-openai-agents-mcp) - Python agent with browser control
- [LangChain / LangGraph](https://github.com/webfuse-com/extension-langchain-mcp) - Multi-page research agent
- [LiveKit Voice Agent](https://github.com/webfuse-com/extension-livekit-mcp) - Voice-controlled browser
- [ChatGPT GPT](https://github.com/webfuse-com/chatgpt-webfuse-mcp) - Custom GPT with browser tools

## License

MIT
