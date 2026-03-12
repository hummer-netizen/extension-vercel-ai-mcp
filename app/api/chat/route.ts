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
      system: `You are a helpful browsing assistant. You can see and control the user's live browser through Webfuse tools.

When the user asks about the page, use see_domSnapshot or see_guiSnapshot first.
When they ask you to interact, use the act_ tools.
Always describe what you see and what you're doing. Be concise.
If a page is large, use a targeted CSS selector with see_domSnapshot to read specific sections.

The active session ID is: ${sessionId}`,
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
