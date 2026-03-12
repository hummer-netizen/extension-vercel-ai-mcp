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

// Strip CSS pseudo-selectors that Webfuse parser doesn't support
function sanitizeSelector(selector: string): string {
  // Remove pseudo-classes and pseudo-elements (:hover, :first-child, ::before, etc.)
  return selector.replace(/:{1,2}[a-zA-Z-]+(\([^)]*\))?/g, '').trim();
}

function truncateToolResults(tools: Record<string, any>): Record<string, any> {
  const wrapped: Record<string, any> = {};
  for (const [name, tool] of Object.entries(tools)) {
    const origExecute = tool.execute;
    wrapped[name] = {
      ...tool,
      execute: async (args: any, options: any) => {
        // Sanitize CSS selectors in see_domSnapshot calls
        if (name === 'see_domSnapshot' && args?.options?.root) {
          const original = args.options.root;
          const sanitized = sanitizeSelector(original);
          if (sanitized !== original) {
            console.log(`[selector-fix] "${original}" -> "${sanitized}"`);
            args.options.root = sanitized || 'body';
          }
        }
        const result = await origExecute(args, options);
        const str = typeof result === 'string' ? result : JSON.stringify(result);
        if (str.length > MAX_TOOL_RESULT_CHARS) {
          return { content: [{ type: 'text', text: str.slice(0, MAX_TOOL_RESULT_CHARS) + '\n... [truncated — use a narrower CSS selector]' }], isError: false };
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
    const tools = truncateToolResults(rawTools);

    const result = streamText({
      model: openai("gpt-4o"),
      system: `You are a browsing assistant controlling the user's CURRENT browser tab via Webfuse.
The user is already viewing a page. You can see and interact with whatever they see.

RULES:
- ALWAYS pass session_id: "${sessionId}" to every tool call
- For see_domSnapshot, ALWAYS include options.root with a NARROW CSS selector
- The user is ALREADY on a page — never ask for a URL

SELECTOR RULES (CRITICAL — invalid selectors will fail):
- Use ONLY: tag names, #id, .class, attribute selectors, and combinators (>, +, ~, space)
- NEVER use pseudo-selectors: NO :first-child, :nth-child(), :first-of-type, :has(), :not(), :contains(), ::before, ::after
- These are NOT supported and will cause errors

READING STRATEGY:
1. Title: options.root = "#firstHeading" or "h1"
2. Table of contents: options.root = "#toc"
3. Summary box: options.root = ".infobox"
4. For a specific section: use the section heading ID, e.g. "#Tourism", "#History", "#Geography"
5. For section CONTENT: use the heading's parent wrapper, e.g. ".mw-heading + p", ".mw-heading + ul"
   Or read a broader area: "#bodyContent p" (will be truncated to fit)
6. For general pages: "main", "article", "#content"

IMPORTANT: If a result says "[truncated]", use a NARROWER selector to get specific content.
Be concise and helpful. Summarize what you read.`,
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
