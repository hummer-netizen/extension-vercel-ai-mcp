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

    const { text, steps } = await generateText({
      model: openai("gpt-4o"),
      system: `You are a browsing assistant controlling the user's CURRENT browser tab via Webfuse.
The user is already viewing a page. You can see and interact with it.

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

CLICKING LINKS:
- To click a link by its text, use act_click with selector matching the link
- To go back, use navigate with the previous URL or the browser back

Be concise. Summarize what you find. When listing items, include their rank/number.`,
      messages,
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
