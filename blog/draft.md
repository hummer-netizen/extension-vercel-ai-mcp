---
title: "Build a Browsing Assistant with Vercel AI SDK and Webfuse"
description: "Create a Next.js chat app where users talk to an AI that sees and controls their browser. Vercel AI SDK + Webfuse MCP. TypeScript. Deployable to Vercel."
shortTitle: "Vercel AI SDK + Webfuse MCP"
created: 2026-03-11
category: ai-agents
authorId: nicholas-piel
tags: ["vercel", "ai-sdk", "nextjs", "mcp", "browser-automation", "webfuse", "typescript"]
featurePriority: 0
relatedLinks:
  - text: "Claude Desktop + Webfuse"
    href: "/blog/connect-claude-to-a-live-browser-with-webfuse-mcp"
    description: "Zero-code alternative: connect Claude Desktop directly."
  - text: "OpenAI Agent + Webfuse"
    href: "/blog/build-an-ai-agent-that-controls-a-live-browser"
    description: "Python version with the OpenAI Agents SDK."
  - text: "Session MCP Server Docs"
    href: "https://dev.webfu.se/session-mcp-server/"
    description: "Full reference for the 13 browser tools."
faqs:
  - question: "Can I deploy this to Vercel?"
    answer: "Yes. The Next.js app deploys like any other. The MCP connection happens server-side in the API route."
  - question: "Does it work with other models?"
    answer: "Yes. The Vercel AI SDK supports OpenAI, Anthropic, Google, and more. Swap the model provider in one line."
  - question: "Is this a chatbot or an automation tool?"
    answer: "Both. Users chat naturally. The AI decides when to use browser tools. It's a conversation that can also click buttons."
---

What if your Next.js app could browse the web for your users?

Not fetch an API. Not scrape a page. Actually browse. Click links. Fill forms. Read what's on the screen. All through a chat interface your users already know how to use.

<TldrBox title="TL;DR">

**Vercel AI SDK + Webfuse MCP = a chat app that controls a live browser.** One API route. One MCP endpoint. Users chat, the AI browses. Deploy to Vercel like any Next.js app.

Source: [github.com/hummer-netizen/extension-vercel-ai-mcp](https://github.com/hummer-netizen/extension-vercel-ai-mcp)

</TldrBox>

## The Idea

Most AI chat apps are text-in, text-out. The AI reasons about what you said and responds.

This one has hands.

The user types "find the cheapest flight to Amsterdam." The AI opens a travel site, fills in the search, scrolls through results, and reports back. The user watches it happen in their browser. If the AI picks the wrong date, the user just says "make it March 15th" and the AI corrects it.

It's a conversation that can also click buttons.

## The Stack

- **Next.js** with an API route for the chat endpoint
- **Vercel AI SDK** for streaming responses and tool handling
- **Webfuse Session MCP** for browser control (13 tools, auto-discovered)
- **Webfuse Extension** for the sidebar chat UI

## The API Route

The entire backend is one file:

```typescript
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";

export async function POST(req: Request) {
  const { messages, sessionId } = await req.json();

  const result = streamText({
    model: openai("gpt-4o"),
    system: `You are a helpful browsing assistant.
      You can see and control the user's browser.
      The session ID is: ${sessionId}`,
    messages,
    maxSteps: 10,
  });

  return result.toDataStreamResponse();
}
```

The Vercel AI SDK handles MCP tool discovery, execution, and streaming. You don't parse tool calls. You don't manage state. `streamText` does it all.

`maxSteps: 10` means the AI can chain up to 10 tool calls per message. It might snapshot the page, then click a link, then snapshot again, then read a table. All from one user message.

## The Chat UI

A Webfuse extension sidebar with a simple chat interface. Users type messages. The AI responds and uses browser tools as needed.

The extension only knows two things: the session ID (from `browser.webfuseSession`) and the API URL. It sends messages to the Next.js API route and streams the responses back.

No API keys in the extension. No browser logic. Just a chat window.

## Why Chat Beats Scripted Journeys

The OpenAI demo (our other integration) runs a fixed 7-step journey. Click "Start" and watch. It's great for demos.

But real users don't want a script. They want to talk.

"What does this page say about pricing?" "Click on the Enterprise plan." "Go back and check the FAQ." "Actually, open a new tab and search for alternatives."

A chat interface handles all of this naturally. The AI decides when to use tools based on what the user asks. No predefined steps. No rigid flow.

::ArticleSignupCta
---
heading: "Give your Next.js app a browser"
subtitle: "Webfuse connects the Vercel AI SDK to live web sessions via MCP. Build browsing assistants in minutes."
---
::

## Deploying

The Next.js app deploys to Vercel like any other:

```bash
vercel deploy
```

Set `OPENAI_API_KEY` and `WEBFUSE_REST_KEY` as environment variables. The Webfuse extension goes to your Space. Point `API_URL` at your deployment.

For development, `npm run dev` runs locally on port 3001.

## What Users See

A sidebar chat next to whatever page they're browsing. They type a question. The AI reads the page, maybe clicks something, and answers. The browser moves. The user watches. The conversation continues.

It feels like having a coworker who can browse for you while you talk to them.

## Source Code

Everything is on GitHub: [hummer-netizen/extension-vercel-ai-mcp](https://github.com/hummer-netizen/extension-vercel-ai-mcp)

- `app/api/chat/route.ts` -- One API route. The whole backend.
- `extension/` -- Webfuse sidebar extension (chat UI)
- `blog/` -- This blog post
