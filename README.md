# Vercel AI SDK + Webfuse MCP

A Next.js chat app where users talk to an AI that controls their browser.

Built with the [Vercel AI SDK](https://sdk.vercel.ai/) and [Webfuse Session MCP](https://dev.webfu.se/session-mcp-server/).

## What It Does

A chat interface inside a Webfuse extension sidebar. Users type messages, the AI browses the page for them. It reads content, clicks links, fills forms, and reports back — all in a conversational flow.

The difference from the OpenAI demo: this is a **chat**, not a scripted journey. Users ask questions and give commands in natural language.

## Quick Start

```bash
npm install
cp .env.example .env  # Add your OpenAI + Webfuse keys
npm run dev
```

Deploy the `extension/` folder as a Webfuse extension.

## Architecture

```
Webfuse Extension (sidebar)     Next.js API Route
                                
  Chat UI           --POST-->   /api/chat
  User messages                 
  AI responses      <--stream-- Vercel AI SDK
                                + MCP tool calls
                                → Webfuse Session MCP
```

## Stack

- **Next.js** — API routes + optional web UI
- **Vercel AI SDK** — `streamText()` with MCP tool support
- **Webfuse Extension** — Sidebar chat UI in the browser session
- **Session MCP Server** — 13 browser tools, auto-discovered

## Links

- [Blog Post](/blog/build-a-browsing-assistant-with-vercel-ai-sdk-and-webfuse)
- [Webfuse](https://webfuse.com)
- [Vercel AI SDK Docs](https://sdk.vercel.ai/docs)
- [Session MCP Server Docs](https://dev.webfu.se/session-mcp-server/)
