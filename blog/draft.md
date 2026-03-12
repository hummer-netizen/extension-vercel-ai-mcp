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
  - question: "Why generateText instead of streamText?"
    answer: "The Webfuse proxy buffers responses between multi-step tool calls. generateText waits for all steps to complete, then returns the final result. Simpler and more reliable."
---

What if your Next.js app could browse the web for your users?

Not fetch an API. Not scrape a page. Actually browse. Click links. Fill forms. Read what's on the screen. All through a chat interface your users already know how to use.

<TldrBox title="TL;DR">

**Vercel AI SDK + Webfuse MCP = a chat app that controls a live browser.** One API route. One MCP endpoint. Users chat, the AI browses. Deploy to Vercel like any Next.js app.

Source: [github.com/hummer-netizen/extension-vercel-ai-mcp](https://github.com/hummer-netizen/extension-vercel-ai-mcp)

Live demo: [webfu.se/+vercel-ai-mcp/](https://webfu.se/+vercel-ai-mcp/)

</TldrBox>

## The Idea

Most AI chat apps are text-in, text-out. The AI reasons about what you said and responds.

This one has hands.

The user types "what is this page about?" The AI reads the page title and content, then answers. The user asks "what are the main attractions?" The AI clicks through to the Tourism section, reads it, and lists the highlights. All in a natural conversation.

It's a chat interface with browser superpowers.

## The Stack

- **Next.js** with an API route for the chat endpoint
- **Vercel AI SDK** for multi-step tool execution and MCP integration
- **Webfuse Session MCP** for browser control (13 tools, auto-discovered)
- **Webfuse Extension** for the sidebar chat UI

## The API Route

The entire backend is one file. Here's the essence:

```typescript
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { experimental_createMCPClient as createMCPClient } from "ai";

export async function POST(req: Request) {
  const { messages, sessionId } = await req.json();

  // Connect to Webfuse Session MCP — auto-discovers 13 browser tools
  const mcpClient = await createMCPClient({
    transport: new StreamableHTTPClientTransport(
      new URL("https://session-mcp.webfu.se/mcp"),
      {
        requestInit: {
          headers: {
            Authorization: `Bearer ${process.env.WEBFUSE_REST_KEY}`,
          },
        },
      }
    ),
  });

  const tools = await mcpClient.tools();

  const { text, steps } = await generateText({
    model: openai("gpt-4o"),
    system: "You are a browsing assistant. You can see and control the user's browser.",
    messages,
    tools,        // 13 Webfuse browser tools, auto-discovered
    maxSteps: 10, // AI can chain up to 10 tool calls per message
  });

  await mcpClient.close();

  return Response.json({ text, toolNames: steps.flatMap(s =>
    (s.toolCalls || []).map(tc => tc.toolName)
  )});
}
```

That's it. The Vercel AI SDK's `createMCPClient` connects to the Webfuse Session MCP endpoint and auto-discovers all 13 browser tools. `generateText` handles tool calls, chaining, and multi-step reasoning. You don't parse tool calls. You don't manage state.

`maxSteps: 10` means the AI can chain up to 10 tool calls per message. It might read the page title, then click a TOC link, then read a section, then summarize. All from one user message.

We use `generateText` instead of `streamText` because the AI often needs multiple steps (read page, then respond). `generateText` waits for all steps to complete and returns the final result. Clean and reliable.

## Making It Production-Ready

The demo code above is the concept. The [actual route.ts](https://github.com/hummer-netizen/extension-vercel-ai-mcp/blob/main/app/api/chat/route.ts) adds two things for reliability:

**Tool result truncation.** Web pages can be huge. A full Wikipedia article is 2MB of HTML. The production code caps tool results at 15,000 characters and tells the AI to use narrower CSS selectors if content is truncated.

**CSS selector sanitization.** The Webfuse proxy has its own CSS parser that doesn't support pseudo-selectors (`:nth-child`, `:first-of-type`) or sibling combinators (`~`, `+`). The production code strips these before passing selectors to MCP tools.

Both are a few lines of code. See the repo for details.

## The Chat UI

A Webfuse extension sidebar with a simple chat interface. Users type messages. The AI responds and shows tool indicators (👁️ Reading page, 👆 Clicking) as it works.

The extension sends messages to the Next.js API route and displays the response. No API keys in the browser. No browser control logic on the client. Just a chat window.

```javascript
// Get the Webfuse session ID
const info = await browser.webfuseSession.getSessionInfo();
const sessionId = info.sessionId;

// Send to your API route
const resp = await fetch(`${API_URL}/api/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ messages, sessionId }),
});

const { text, toolNames } = await resp.json();
// text = "This page is about Amsterdam..."
// toolNames = ["see_domSnapshot", "see_domSnapshot"]
```

The response includes both the AI's text and which tools it used, so the UI can show indicators like "👁️ Reading page" while the user waits.

## Why Chat Beats Scripted Journeys

The OpenAI demo (our other integration) runs a scripted multi-step journey. Great for demos.

But real users don't want a script. They want to talk.

"What does this page say about pricing?" "Click on the Enterprise plan." "Go back and check the FAQ." "Actually, search for alternatives."

A chat interface handles all of this naturally. The AI decides when to use tools based on what the user asks. No predefined steps. No rigid flow.

## Swapping Models

One of the best things about the Vercel AI SDK: switching models is a one-line change.

```typescript
// OpenAI
import { openai } from "@ai-sdk/openai";
const model = openai("gpt-4o");

// Anthropic
import { anthropic } from "@ai-sdk/anthropic";
const model = anthropic("claude-sonnet-4-20250514");

// Google
import { google } from "@ai-sdk/google";
const model = google("gemini-2.0-flash");
```

The Webfuse MCP tools work identically across all models. Same tools, same schema, same behavior.

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

- `app/api/chat/route.ts` — One API route. The whole backend.
- `extension/` — Webfuse sidebar extension (chat UI)
- `blog/` — This blog post
