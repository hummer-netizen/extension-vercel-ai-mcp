---
title: "Build a Browsing Assistant with Vercel AI SDK and Webfuse MCP"
description: "Give your Next.js app browser superpowers. One API route connects the Vercel AI SDK to a live browser via MCP. The AI reads pages, clicks links, and types in forms."
shortTitle: "Vercel AI SDK + Webfuse MCP"
created: 2026-03-11
category: ai-agents
authorId: nicholas-piel
tags: ["vercel", "ai-sdk", "nextjs", "mcp", "browser-automation", "webfuse", "typescript"]
featurePriority: 0
relatedLinks:
  - text: "LangChain + Webfuse"
    href: "/blog/how-to-connect-langchain-to-a-live-browser-with-webfuse-mcp"
    description: "Python version with LangGraph."
  - text: "OpenAI Agent + Webfuse"
    href: "/blog/build-an-ai-agent-that-controls-a-live-browser"
    description: "Guided journey demo with the OpenAI Agents SDK."
  - text: "Session MCP Server Docs"
    href: "https://dev.webfu.se/session-mcp-server/"
    description: "Full reference for the 13 browser tools."
faqs:
  - question: "Can I deploy this to Vercel?"
    answer: "Yes. The Next.js app deploys like any other. The MCP connection happens server-side in the API route. Set OPENAI_API_KEY and WEBFUSE_REST_KEY as environment variables."
  - question: "Does it work with other models?"
    answer: "Yes. The Vercel AI SDK supports OpenAI, Anthropic, Google, and more. Swap the model provider in one line — the MCP tools work identically."
  - question: "Why generateText instead of streamText?"
    answer: "The AI often chains multiple tool calls per message (read page → click → read again). generateText waits for all steps to complete and returns the final result cleanly."
  - question: "What's the latency?"
    answer: "Simple questions (from pre-loaded context): 2-3 seconds. Multi-step actions (navigate + read): 5-15 seconds. Depends on the model and page complexity."
---

What if your Next.js app could browse the web?

Not fetch an API. Not scrape HTML. Actually browse — click links, read pages, type in forms — all driven by an AI model through a chat interface.

The Vercel AI SDK already handles tool calling, multi-step reasoning, and model switching. Webfuse adds 13 browser tools via MCP. Connect the two and you get a chat app that controls a live browser session.

<TldrBox title="TL;DR">

One API route. One MCP endpoint. `generateText` + `maxSteps` handles the rest. The AI auto-discovers 13 browser tools and chains them to read, click, and type across any website.

Source: [github.com/hummer-netizen/extension-vercel-ai-mcp](https://github.com/hummer-netizen/extension-vercel-ai-mcp)

Live demo: [webfu.se/+vercel-ai-mcp/](https://webfu.se/+vercel-ai-mcp/)

</TldrBox>

## How It Works

The Vercel AI SDK has built-in MCP support through `experimental_createMCPClient`. Point it at the Webfuse Session MCP endpoint and it auto-discovers 13 browser tools: read DOM snapshots, click elements, type text, navigate, scroll, take screenshots.

`generateText` with `maxSteps: 10` lets the AI chain these tools. Ask "open the top story and summarize it" and GPT-4o will: read the page → click the link → read the article → respond. Four tool calls, one user message, zero glue code.

## The API Route

The entire backend is one file — `app/api/chat/route.ts`:

```typescript
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
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
    system: "You are a browsing assistant. Use browser tools to answer questions about the current page.",
    messages,
    tools,        // 13 browser tools, auto-discovered via MCP
    maxSteps: 10, // chain up to 10 tool calls per message
  });

  await mcpClient.close();

  return Response.json({
    text,
    toolNames: steps.flatMap(s =>
      (s.toolCalls || []).map(tc => tc.toolName)
    ),
  });
}
```

That's the core. `createMCPClient` handles the MCP handshake. `generateText` handles tool calling and multi-step chaining. You don't parse tool schemas, manage state, or write tool dispatch logic.

The `toolNames` in the response tell the frontend which tools were used, so it can show indicators like "reading the page..." while the user waits.

## Pre-Loading Page Context

One pattern that makes a big difference: read the page before the model starts thinking.

```typescript
const rawTools = await mcpClient.tools();

// On first message, inject current page content as context
if (messages.length === 1 && messages[0].role === 'user') {
  const snapshot = rawTools['see_domSnapshot'];
  const overview = await snapshot.execute({
    session_id: sessionId,
    options: { root: 'body', quality: 0.1 },
  });

  messages = [{
    role: 'user',
    content: `[Current page content]:\n${overview}\n\nUser: ${messages[0].content}`,
  }];
}
```

The `quality: 0.1` parameter returns a compact text summary of the page. On a typical page, that's 5-10KB of structured content. Now when the user asks "what's on this page?" the model already knows — instant response, no tool call needed.

For follow-up messages, the model uses tools on demand. First message is fast, subsequent messages are smart.

## Handling Large Pages

Web pages can be enormous. A full Wikipedia article is 2MB of HTML — way beyond any model's context window. Wrap tool results with a size cap:

```typescript
function wrapTools(tools: Record<string, any>): Record<string, any> {
  const wrapped: Record<string, any> = {};
  for (const [name, tool] of Object.entries(tools)) {
    wrapped[name] = {
      ...tool,
      execute: async (args: any, options: any) => {
        const result = await tool.execute(args, options);
        const str = typeof result === 'string' ? result : JSON.stringify(result);
        if (str.length > 15_000) {
          return str.slice(0, 15_000) + '\n... [truncated — use a narrower CSS selector]';
        }
        return result;
      },
    };
  }
  return wrapped;
}

const tools = wrapTools(await mcpClient.tools());
```

The hint in the truncation message matters. The model reads "use a narrower CSS selector" and on the next step it targets `"article"` or `".main-content"` instead of `"body"`. It learns to be specific.

## The Frontend

The chat UI runs as a Webfuse extension sidebar. The key integration point:

```javascript
// Webfuse gives you the session ID — this is the link between
// your backend and the user's live browser tab
const info = await browser.webfuseSession.getSessionInfo();
const sessionId = info.sessionId;

const resp = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ messages, sessionId }),
});

const { text, toolNames } = await resp.json();
```

The `sessionId` is the bridge. Your API route passes it to every MCP tool call. Webfuse routes those tool calls to the correct browser tab. The user sees the AI click and type in real time.

The demo includes pre-built prompt suggestions to help new users get started. On Hacker News, things like "What's trending?", "Open story #3", and "Write a funny comment on #1" — that last one types a comment directly into the text box without submitting, so the user stays in control.

## Switching Models

One of the best parts of the Vercel AI SDK — model switching is a one-line change:

```typescript
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";

// Pick one:
const model = openai("gpt-4o");
const model = anthropic("claude-sonnet-4-20250514");
const model = google("gemini-2.0-flash");
```

The MCP tools work identically across all providers. Same tool schemas, same behavior, same results.

::ArticleSignupCta
---
heading: "Give your Next.js app a browser"
subtitle: "Connect the Vercel AI SDK to live browser sessions via MCP. Build browsing assistants in one API route."
---
::

## What You Can Build

The demo runs on Hacker News. The pattern works anywhere:

- **Customer support tools.** A sidebar that reads the user's actual account page and answers questions about their data.
- **Internal dashboards.** "What's the error rate this week?" — the agent reads your Grafana dashboard and summarizes.
- **Shopping assistants.** "Find a blue jacket under $100" — it searches, filters, scrolls through results.
- **Form automation.** "Fill in my shipping address" — it types in the fields. You review and submit.

Same API route. Different system prompt. Different website.

## Try It

Live demo: [webfu.se/+vercel-ai-mcp/](https://webfu.se/+vercel-ai-mcp/)

Source code: [github.com/hummer-netizen/extension-vercel-ai-mcp](https://github.com/hummer-netizen/extension-vercel-ai-mcp)

- `app/api/chat/route.ts` — the complete API route
- `extension/` — Webfuse sidebar extension
