import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";

export async function POST(req: Request) {
  const { messages, sessionId } = await req.json();

  const restKey = process.env.WEBFUSE_REST_KEY!;

  const result = streamText({
    model: openai("gpt-4o"),
    system: `You are a helpful browsing assistant. You can see and control the user's browser through Webfuse MCP tools.

When the user asks you to do something on the page, use the available tools. Describe what you see and what you're doing.

The session ID is: ${sessionId}`,
    messages,
    tools: {
      // Vercel AI SDK discovers MCP tools automatically
    },
    experimental_toToolResultContent(result) {
      return [{ type: "text", text: JSON.stringify(result) }];
    },
    maxSteps: 10,
  });

  return result.toDataStreamResponse();
}
