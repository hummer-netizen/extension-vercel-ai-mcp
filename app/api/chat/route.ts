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

function truncateToolResults(tools: Record<string, any>): Record<string, any> {
  const wrapped: Record<string, any> = {};
  for (const [name, tool] of Object.entries(tools)) {
    const origExecute = tool.execute;
    wrapped[name] = {
      ...tool,
      execute: async (args: any, options: any) => {
        const result = await origExecute(args, options);
        const str = typeof result === 'string' ? result : JSON.stringify(result);
        if (str.length > MAX_TOOL_RESULT_CHARS) {
          return { content: [{ type: 'text', text: str.slice(0, MAX_TOOL_RESULT_CHARS) + '\n... [truncated, use a narrower selector]' }], isError: false };
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
- The user is ALREADY on a page — never ask for a URL. Just read the page.
- Start by reading the title: options.root = "#firstHeading" or "h1"
- For page content, use NARROW selectors like:
  "#toc" for table of contents
  ".infobox" for summary box
  "p" for paragraphs (limited to visible ones)
- Do NOT use broad selectors like "#mw-content-text .mw-parser-output" — too large!
- NEVER call see_domSnapshot without options.root
- Do NOT use see_guiSnapshot
- Be concise and helpful.`,
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
