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
- The user is ALREADY on a page. Never ask for a URL.

CSS SELECTOR RULES (CRITICAL):
- ONLY use: tag names (h1, p, div), #id, .class, descendant selectors (space)
- NEVER use: :pseudo-selectors, ~ (sibling), + (adjacent), :has(), :not(), :nth-child()
- These cause errors and return the wrong content

READING STRATEGY:
1. Page title: "#firstHeading" or "h1"
2. Table of contents: "#toc"
3. Summary box: ".infobox"
4. Specific section heading: "#Tourism", "#History" etc
5. Page body text: "#bodyContent" - returns first ~15k chars
6. If content is truncated, click a TOC link then read "#bodyContent" again

Be concise. Summarize what you find.`,
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
