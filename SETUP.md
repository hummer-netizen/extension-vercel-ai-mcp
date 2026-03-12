# Setup Guide

## Prerequisites

- Node.js 18+
- An OpenAI API key (or Anthropic/Google — swap in `route.ts`)
- A Webfuse Space with the Automation app enabled

## Local Development

```bash
git clone https://github.com/hummer-netizen/extension-vercel-ai-mcp.git
cd extension-vercel-ai-mcp
npm install
cp .env.example .env
# Edit .env: add your OPENAI_API_KEY and WEBFUSE_REST_KEY
npm run dev
```

The server runs on `http://localhost:3001`.

## Deploy the Extension

1. Go to [Webfuse Studio](https://studio.webfu.se) and open your Space
2. Navigate to **Extensions** and deploy from GitHub:
   - Repo URL: `https://github.com/hummer-netizen/extension-vercel-ai-mcp/extension`
3. Set the `API_URL` env var to your server URL (e.g. `http://localhost:3001` for local dev)
4. Open a Session and the sidebar chat appears automatically

## Deploy to Vercel

```bash
vercel deploy
```

Set environment variables in the Vercel dashboard:
- `OPENAI_API_KEY` — your OpenAI key
- `WEBFUSE_REST_KEY` — your Space REST key (starts with `rk_`)

Then update `API_URL` in the Webfuse extension settings to your Vercel deployment URL.

## Deploy Anywhere Else

It's a standard Next.js app. Deploy to Render, Railway, Fly.io, AWS, or any Node.js host:

```bash
npm run build
npm start
```

## Switching Models

Edit `app/api/chat/route.ts`:

```typescript
// OpenAI (default)
import { openai } from "@ai-sdk/openai";
const model = openai("gpt-4o");

// Anthropic
import { anthropic } from "@ai-sdk/anthropic";
const model = anthropic("claude-sonnet-4-20250514");

// Google
import { google } from "@ai-sdk/google";
const model = google("gemini-2.0-flash");
```

Install the corresponding provider package:
```bash
npm install @ai-sdk/anthropic  # or @ai-sdk/google
```

## Troubleshooting

### "No tools available" or MCP connection fails

- Check your `WEBFUSE_REST_KEY` is correct and starts with `rk_`
- Make sure the Automation app is enabled on your Space
- Verify there's an active Session (open your Space URL in a browser)

### CORS errors in the extension

- The API route includes CORS headers for `*`. If you see CORS errors, check that
  the `API_URL` env var matches your actual server URL
- For local dev, use `http://localhost:3001` (not `127.0.0.1`)

### Extension sidebar doesn't appear

- Check the extension is deployed and enabled in your Space
- The `background.js` auto-opens the sidebar via `browser.sidePanel.open()`
- Try restarting the Session after deploying the extension
