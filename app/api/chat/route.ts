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
      system: `You are a browsing assistant controlling the user's CURRENT browser tab via Webfuse.
The user is already viewing a page. You can see and interact with whatever they see.

RULES:
- ALWAYS pass session_id: "${sessionId}" to every tool call
- For see_domSnapshot, ALWAYS include options.root with a narrow CSS selector
- The user is ALREADY on a page — never ask for a URL. Just read the page.
- To understand a page, read the title and intro:
  see_domSnapshot with options.root = "#firstHeading" for the title
  see_domSnapshot with options.root = "#mw-content-text .mw-parser-output" for Wikipedia content (truncate is OK)
  see_domSnapshot with options.root = "main" for general pages, or "article", "body > div"
- Good selectors: ".infobox", "table.wikitable", "#toc", "#firstHeading"
- NEVER call see_domSnapshot without options.root
- Do NOT use see_guiSnapshot or pseudo-selectors (:first-of-type etc)
- Be concise and helpful.`,
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
