import { streamText } from "ai";
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

// Strip unsupported CSS features: pseudo-selectors AND sibling combinators
function sanitizeSelector(selector: string): string {
  let s = selector;
  // Remove pseudo-classes/elements
  s = s.replace(/:{1,2}[a-zA-Z-]+(\([^)]*\))?/g, '');
  // Remove ~ (general sibling) and + (adjacent sibling) combinators
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
        // Sanitize selectors
        if (name === 'see_domSnapshot' && args?.options?.root) {
          const original = args.options.root;
          args.options.root = sanitizeSelector(original);
          if (!args.options.root) args.options.root = 'body';
        }
        const result = await origExecute(args, options);
        const str = typeof result === 'string' ? result : JSON.stringify(result);
        if (str.length > MAX_TOOL_RESULT_CHARS) {
          return {
            content: [{ type: 'text', text: str.slice(0, MAX_TOOL_RESULT_CHARS) +
              '\n... [truncated - content too large. Try a more specific CSS selector or read a different section]' }],
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

    const result = streamText({
      model: openai("gpt-4o"),
      system: `You are a browsing assistant controlling the user's CURRENT browser tab via Webfuse.
The user is already viewing a page. You can see and interact with it.

RULES:
- ALWAYS pass session_id: "${sessionId}" to every tool call
- For see_domSnapshot, ALWAYS include options.root with a CSS selector
- The user is ALREADY on a page. Never ask for a URL.

CSS SELECTOR RULES (CRITICAL):
- ONLY use: tag names (h1, p, div), #id, .class, descendant selectors (space)
- NEVER use: :pseudo-selectors, ~ (sibling), + (adjacent), :has(), :not(), :nth-child()
- These cause errors and return the wrong content

READING STRATEGY:
1. Page title: "#firstHeading" or "h1"
2. Table of contents: "#toc" - use this to discover section names
3. Summary box: ".infobox"  
4. Specific section heading: use the heading ID like "#Tourism", "#History"
5. Page body text: "#bodyContent" - returns up to 15k chars of content
6. If you need a specific section not in the first 15k chars, first navigate to it with act_click on a TOC link, then read "#bodyContent" again

Be concise. Summarize what you find.`,
      messages,
      tools,
      maxSteps: 10,
      onFinish: async () => {
        await mcpClient.close();
      },
    });

    const response = result.toDataStreamResponse();
    for (const [key, value] of Object.entries(corsHeaders)) {
      response.headers.set(key, value);
    }
    return response;
  } catch (e) {
    await mcpClient.close();
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
}
