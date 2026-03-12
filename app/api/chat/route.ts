import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { experimental_createMCPClient as createMCPClient } from "ai";

export const maxDuration = 60;

// CORS: the Webfuse extension sidebar calls this cross-origin
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: Request) {
  const { messages, sessionId } = await req.json();

  const restKey = process.env.WEBFUSE_REST_KEY!;

  // Connect to Webfuse Session MCP — auto-discovers 13 browser tools
  const mcpClient = await createMCPClient({
    transport: new StreamableHTTPClientTransport(
      new URL("https://session-mcp.webfu.se/mcp"),
      {
        requestInit: {
          headers: {
            Authorization: `Bearer ${restKey}`,
          },
        },
      }
    ),
  });

  try {
    const tools = await mcpClient.tools();

    const result = streamText({
      model: openai("gpt-4o"),
      system: `You are a helpful browsing assistant controlling a live browser via Webfuse.

IMPORTANT RULES:
- ALWAYS pass session_id: "${sessionId}" to every tool call
- For see_domSnapshot, ALWAYS include options.root with a narrow CSS selector
  Good: options.root = ".infobox", "h1", "#firstHeading", "table.wikitable", "#toc"
  NEVER call see_domSnapshot without options.root — full pages will timeout
- Do NOT use see_guiSnapshot (not available)
- Do NOT use CSS pseudo-selectors (:first-of-type, :nth-child) — not supported
- When the user asks about a page, read the title (h1) and first paragraph first
- Be concise. Describe what you see and do.`,
      messages,
      tools,
      maxSteps: 10,
      onFinish: async () => {
        await mcpClient.close();
      },
    });

    const response = result.toDataStreamResponse();

    // Add CORS headers to the streaming response
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
