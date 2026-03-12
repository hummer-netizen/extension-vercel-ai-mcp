import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { experimental_createMCPClient as createMCPClient } from "ai";

export const maxDuration = 60;

const MAX_TOOL_RESULT_CHARS = 15000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

function sanitizeSelector(selector: string): string {
  let s = selector;
  s = s.replace(/:{1,2}[a-zA-Z-]+(\([^)]*\))?/g, '');
  s = s.replace(/\s*[~+]\s*/g, ' ');
  return s.trim();
}

function wrapTools(tools: Record<string, any>): Record<string, any> {
  const wrapped: Record<string, any> = {};
  for (const [name, tool] of Object.entries(tools)) {
    const origExecute = tool.execute;
    wrapped[name] = {
      ...tool,
      execute: async (args: any, options: any) => {
        if (name === 'see_domSnapshot' && args?.options?.root) {
          args.options.root = sanitizeSelector(args.options.root) || 'body';
        }
        const result = await origExecute(args, options);
        const str = typeof result === 'string' ? result : JSON.stringify(result);
        if (str.length > MAX_TOOL_RESULT_CHARS) {
          return {
            content: [{ type: 'text', text: str.slice(0, MAX_TOOL_RESULT_CHARS) +
              '\n... [truncated - use a narrower CSS selector]' }],
            isError: false
          };
        }
        return result;
      },
    };
  }
  return wrapped;
}

export async function POST(req: Request) {
  const { messages, sessionId } = await req.json();
  const restKey = process.env.WEBFUSE_REST_KEY!;

  const mcpClient = await createMCPClient({
    transport: new StreamableHTTPClientTransport(
      new URL("https://session-mcp.webfu.se/mcp"),
      {
        requestInit: {
          headers: { Authorization: `Bearer ${restKey}` },
        },
      }
    ),
  });

  try {
    const rawTools = await mcpClient.tools();
    const tools = wrapTools(rawTools);

    // Auto-read page on first message using the already-initialized MCP client
    let contextMessages = [...messages];
    if (messages.length === 1 && messages[0].role === 'user') {
      try {
        const readTool = rawTools['see_domSnapshot'];
        if (readTool) {
          const overview = await readTool.execute(
            { session_id: sessionId, options: { root: 'body', quality: 0.1 } },
            { abortSignal: AbortSignal.timeout(10000) } as any
          );
          const overviewStr = typeof overview === 'string' ? overview : JSON.stringify(overview);
          if (overviewStr.length > 50) {
            const trimmed = overviewStr.slice(0, 8000);
            contextMessages = [
              { role: 'user', content: '[Current page content]:\n' + trimmed + '\n\nUser question: ' + messages[0].content },
            ];
          }
        }
      } catch (e) {
        console.log('[auto-read error]', e);
      }
    }

    const { text, steps } = await generateText({
      model: openai("gpt-4o"),
      system: `You are a browsing assistant controlling the user's CURRENT browser tab via Webfuse.
The user is already viewing a page. You can see and interact with it.

CRITICAL RULE: For EVERY user message, you MUST read the page first using see_domSnapshot before responding.
Never answer from your own knowledge. Never ask the user what they mean. The answer is always on the page.

RULES:
- ALWAYS pass session_id: "${sessionId}" to every tool call
- For see_domSnapshot, ALWAYS include options.root with a CSS selector
- The user is ALREADY on a page. Do not ask them for a URL.

READING STRATEGY:
1. Start with a page overview: use see_domSnapshot with options.root = "body" and options.quality = 0.1
   This returns a compact text-only summary — great for list pages, tables, and navigation.
2. For specific content: use a narrow CSS selector like "h1", ".infobox", "#section-id", "article"
3. If content is truncated, use a narrower selector or click a link to navigate deeper.

HANDLING LIST PAGES (e.g. Hacker News, search results, product listings):
- First read the page with quality 0.1 to see all items with their numbers/ranks
- When the user refers to "the 3rd link" or "item #5", map that to the correct item from the overview
- To click a specific story/link, use act_click with a selector that targets it (e.g. the link text)
- After clicking into an article, read the new page content, then you can go back

HACKER NEWS SPECIFIC:
- Each story has an ID visible in vote links like "vote?id=47350424" — extract the number
- The COMMENTS page URL is: https://news.ycombinator.com/item?id=<ID>
- The ARTICLE link is in the .titleline element
- To open comments: use navigate with https://news.ycombinator.com/item?id=<ID>
- To open the article itself: use act_click on the story title link
- Comments on HN are in .comment elements inside .comtr table rows
- To read comments: navigate to the item page, then see_domSnapshot with root ".comment-tree" or ".comtr"

COMMENTING ON HN:
- When asked to write/add a comment: ALWAYS navigate to the comments page first using https://news.ycombinator.com/item?id=<ID>
- Then use act_type with target "textarea" to type the comment into the text box
- IMPORTANT: Type the comment but DO NOT submit it. Do NOT click any submit/reply button. Let the user review and submit themselves.
- If the user asks for a "funny comment", write something witty and tech-related. Be clever, not cringe.
- If there's no textarea (login required), tell the user they need to log in, but still show them what you WOULD have typed.
- Keep comments short and punchy — this is HN, not a blog post.
- ALWAYS navigate first, then type. Never just suggest a comment without trying to type it.

CLICKING LINKS:
- To click a link by its text, use act_click with selector matching the link
- To go back, use navigate with the previous URL

IMPORTANT: Always read the page first before answering. Never guess or ask for context — the answer is on the page.

Be concise. Summarize what you find. When listing items, include their rank/number.`,
      messages: contextMessages,
      tools,
      maxSteps: 10,
    });

    await mcpClient.close();

    // Extract tool names used for UI indicators
    const toolNames: string[] = [];
    for (const step of steps) {
      if (step.toolCalls) {
        for (const tc of step.toolCalls) {
          toolNames.push(tc.toolName);
        }
      }
    }

    return new Response(JSON.stringify({ text, toolNames }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e) {
    await mcpClient.close();
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
}
