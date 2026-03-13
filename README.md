# Vercel AI SDK + Webfuse MCP

A Next.js chat app where users talk to an AI that controls their browser.

Built with the [Vercel AI SDK](https://sdk.vercel.ai/), [MCP](https://modelcontextprotocol.io), and [Webfuse](https://webfuse.com).

## What It Does

A chat interface inside a Webfuse extension sidebar. Users type messages. The AI browses the page for them: reads content, clicks links, fills forms, takes screenshots, and reports back. All conversational.

## Quick Start

```bash
npm install
cp .env.example .env  # Add your OpenAI + Webfuse keys
npm run dev
```

Deploy the `extension/` folder as a Webfuse extension. Set the `API_URL` env var to your server URL.

## How It Works

The API route connects to Webfuse's Session MCP Server, which auto-discovers 13 browser tools. The Vercel AI SDK handles tool calls, chaining, and streaming.

```typescript
// app/api/chat/route.ts — the entire backend
const mcpClient = await createMCPClient({
  transport: new StreamableHTTPClientTransport(
    new URL("https://session-mcp.webfu.se/mcp"),
    { requestInit: { headers: { Authorization: `Bearer ${restKey}` } } }
  ),
});

const tools = await mcpClient.tools();

const result = streamText({
  model: openai("gpt-4o"),
  messages,
  tools,        // 13 browser tools, auto-discovered via MCP
  maxSteps: 10, // chain up to 10 tool calls per message
});

return result.toDataStreamResponse();
```

## Architecture

```
Webfuse Extension (sidebar)     Next.js API Route          Webfuse MCP
                                                            
  Chat UI           →POST→     /api/chat                    
  User messages                 createMCPClient() ─────→   session-mcp.webfu.se
  AI responses      ←stream←   streamText()       ←tools←  13 browser tools
```

## Stack

- **Next.js 15** — API routes + streaming
- **Vercel AI SDK 4** — `streamText()` + `createMCPClient()` for MCP tool integration
- **@modelcontextprotocol/sdk** — StreamableHTTP transport to Webfuse MCP
- **Webfuse Extension** — Sidebar chat UI in the browser session
- **Session MCP Server** — 13 browser tools (see, act, navigate, wait)

## Swap Models in One Line

```typescript
openai("gpt-4o")           // OpenAI
anthropic("claude-sonnet-4-20250514")  // Anthropic
google("gemini-2.0-flash") // Google
```

Same Webfuse tools work across all providers.

## Links

- [Blog Post](blog/draft.md)
- [Webfuse](https://webfuse.com)
- [Vercel AI SDK Docs](https://sdk.vercel.ai/docs)
- [Session MCP Server Docs](https://dev.webfu.se/session-mcp-server/)


## Other Integrations

Webfuse MCP works with any framework. See the other demos:

- **[OpenAI Agents SDK](https://github.com/hummer-netizen/extension-openai-agents-mcp)** — Build a custom agent with the OpenAI Agents SDK
- **[Claude Desktop / Cursor / VS Code](https://github.com/hummer-netizen/extension-claude-mcp)** — Zero-code setup — just a config file
- **[LangChain / LangGraph](https://github.com/hummer-netizen/extension-langchain-mcp)** — Python research agent with multi-page reasoning
- **[LiveKit Voice Agent](https://github.com/hummer-netizen/extension-livekit-mcp)** — Voice-controlled browser agent with WebRTC

## License

MIT
