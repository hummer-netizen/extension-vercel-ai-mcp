---
title: "Build a Browsing Assistant with Vercel AI SDK and Webfuse"
description: "Create a Next.js chat app where an AI reads, clicks, and types in the user's live browser. Vercel AI SDK + Webfuse MCP. Try the Hacker News demo."
shortTitle: "Vercel AI SDK + Webfuse MCP"
created: 2026-03-11
category: ai-agents
authorId: nicholas-piel
tags: ["vercel", "ai-sdk", "nextjs", "mcp", "browser-automation", "webfuse", "typescript", "human-in-the-loop"]
featurePriority: 0
relatedLinks:
  - text: "LangChain + Webfuse"
    href: "/blog/how-to-connect-langchain-to-a-live-browser-with-webfuse-mcp"
    description: "Python version with LangGraph."
  - text: "OpenAI Agent + Webfuse"
    href: "/blog/build-an-ai-agent-that-controls-a-live-browser"
    description: "Guided journey demo with the OpenAI Agents SDK."
  - text: "Claude Desktop + Webfuse"
    href: "/blog/connect-claude-to-a-live-browser-with-webfuse-mcp"
    description: "Zero-code setup with Claude Desktop."
  - text: "Session MCP Server Docs"
    href: "https://dev.webfu.se/session-mcp-server/"
    description: "Full reference for the 13 browser tools."
faqs:
  - question: "Can I deploy this to Vercel?"
    answer: "Yes. The Next.js app deploys like any other. The MCP connection happens server-side in the API route."
  - question: "Does it work with other models?"
    answer: "Yes. The Vercel AI SDK supports OpenAI, Anthropic, Google, and more. Swap the model provider in one line."
  - question: "Is this a chatbot or an automation tool?"
    answer: "Both. Users chat naturally. The AI decides when to use browser tools. It's a conversation that can also click buttons and type in forms."
  - question: "Why generateText instead of streamText?"
    answer: "The AI often chains multiple tool calls per message (read page, click link, read again). generateText waits for all steps to complete and returns the final result. Simpler and more reliable."
  - question: "Can the user see what the AI is doing?"
    answer: "Yes. The AI works in the user's live browser. Every click, navigation, and scroll happens in real time. The user watches and can intervene at any point."
---

What if your Next.js app could browse the web for your users?

Not fetch an API. Not scrape a page. Actually browse. Click links. Read content. Type in forms. All through a chat interface that works alongside any website.

<TldrBox title="TL;DR">

**Vercel AI SDK + Webfuse MCP = a chat app that controls a live browser.** One API route. One MCP endpoint. The AI reads pages, clicks links, and types in forms. The user watches it happen.

Source: [github.com/hummer-netizen/extension-vercel-ai-mcp](https://github.com/hummer-netizen/extension-vercel-ai-mcp)

Live demo: [webfu.se/+vercel-ai-mcp/](https://webfu.se/+vercel-ai-mcp/) — try it on Hacker News

</TldrBox>

## The Demo

The live demo drops you on Hacker News with a sidebar. Try things like:

- **"What's trending?"** — The AI reads the page and summarizes the top stories with points and comment counts.
- **"Open story #3"** — It clicks into the article, reads it, and tells you what it's about.
- **"Show me the comments on #1"** — Navigates to the HN comments page and summarizes the discussion.
- **"Write a funny comment on #1"** — This is the fun one. The AI navigates to the comments page, finds the text input, and *types a comment directly into the box*. It doesn't submit. You review it, laugh (or cringe), and decide whether to post.

That last one is the key. The AI does the work, but you stay in control. Human-in-the-loop by default.

## The Stack

- **Next.js** with one API route for the chat endpoint
- **Vercel AI SDK** for multi-step tool execution and MCP integration
- **Webfuse Session MCP** for browser control (13 tools, auto-discovered)
- **Webfuse Extension** for the sidebar chat UI

## The API Route

The entire backend is one file:

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

The Vercel AI SDK's `createMCPClient` connects to Webfuse and auto-discovers all 13 browser tools. `generateText` handles tool calls, chaining, and multi-step reasoning. You don't parse tool calls. You don't manage state.

`maxSteps: 10` means the AI can chain up to 10 actions per message. Ask "open the top story and summarize it" and it will click the link, wait for the page to load, read the content, and respond. One message, four tool calls.

## Giving the AI Context

One trick that makes a huge difference: read the page before the AI even starts thinking.

```typescript
// On first message, auto-read the page and inject as context
if (messages.length === 1) {
  const overview = await tools['see_domSnapshot'].execute({
    session_id: sessionId,
    options: { root: 'body', quality: 0.1 }
  });
  // Prepend page content to the user's message
  messages[0].content = `[Page content]\n${overview}\n\nUser: ${messages[0].content}`;
}
```

The `quality: 0.1` parameter returns a compact text-only version of the page. On Hacker News, this gives the AI all 30 story titles with their points and IDs in about 8KB. Now when the user says "what has the most points?", the AI already knows. No tool call needed. Instant response.

## The Human-in-the-Loop Part

Most AI demos show agents doing things autonomously. Cool to watch. Scary to deploy.

This demo takes a different approach. The AI works in the user's real browser. Every action is visible. When the AI writes a comment, it types it in the text box and stops. The user reads it, edits it, submits it — or deletes it.

For actions that matter (posting comments, filling forms, submitting orders), this isn't a limitation. It's the whole point. The AI does the tedious part. The human makes the call.

## Making It Production-Ready

The [actual route.ts](https://github.com/hummer-netizen/extension-vercel-ai-mcp/blob/main/app/api/chat/route.ts) adds a few things on top of the core:

**Tool result truncation.** Web pages can be huge. A full Wikipedia article is 2MB of HTML. Cap tool results at 15,000 characters and the AI will automatically use narrower CSS selectors.

**Page-aware system prompt.** Tell the AI about the page structure so it can use the right selectors. For HN: how to find story IDs, how to navigate to comments, where the text input is.

**Auto-read on first message.** Read the page content once, inject it as context. The AI answers simple questions instantly without any tool calls.

## The Chat UI

The sidebar is a Webfuse extension. The demo uses an HN-themed design (Verdana, orange accents), but the architecture works for any site.

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
```

The response includes the AI's text and which tools it used. The UI shows casual indicators — "reading the page...", "clicking something..." — while the user waits.

Suggested actions ("chips") give new users a starting point. Each one is tested and known to work.

## Swapping Models

Switching models is a one-line change:

```typescript
// OpenAI
const model = openai("gpt-4o");

// Anthropic
const model = anthropic("claude-sonnet-4-20250514");

// Google
const model = google("gemini-2.0-flash");
```

The Webfuse MCP tools work identically across all models. Same tools, same schema, same behavior.

::ArticleSignupCta
---
heading: "Give your Next.js app a browser"
subtitle: "Webfuse connects the Vercel AI SDK to live web sessions via MCP. Build browsing assistants in minutes."
---
::

## Beyond Hacker News

The demo uses HN because it's fun and everyone knows it. But the pattern works for any site:

- **Customer support.** "What does this user's account page show?" — the agent reads the real page with real data.
- **Internal tools.** A sidebar on your admin dashboard that answers questions about what's on screen.
- **Shopping assistants.** "Find me a blue jacket under $100" — the agent searches, filters, and shows you options.
- **Form helpers.** "Fill in my shipping address" — the agent types in the fields. You review and submit.

Same code. Different system prompt. Different site.

## Source Code

Everything is on GitHub: [hummer-netizen/extension-vercel-ai-mcp](https://github.com/hummer-netizen/extension-vercel-ai-mcp)

- `app/api/chat/route.ts` — One API route. The whole backend.
- `extension/` — Webfuse sidebar extension (HN-themed chat UI)
- `blog/` — This blog post

Try the live demo: [webfu.se/+vercel-ai-mcp/](https://webfu.se/+vercel-ai-mcp/)
