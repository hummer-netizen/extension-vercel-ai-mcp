import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { experimental_createMCPClient as createMCPClient } from "ai";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages, sessionId } = await req.json();

  const restKey = process.env.WEBFUSE_REST_KEY!;

  // Connect to Webfuse Session MCP Server
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

When the user asks about the page, use see_domSnapshot or see_guiSnapshot first. When they ask you to interact, use the act_ tools.

Describe what you see and what you're doing. Be concise.

The active session ID is: ${sessionId}`,
      messages,
      tools,
      maxSteps: 10,
      onFinish: async () => {
        await mcpClient.close();
      },
    });

    return result.toDataStreamResponse();
  } catch (e) {
    await mcpClient.close();
    throw e;
  }
}
