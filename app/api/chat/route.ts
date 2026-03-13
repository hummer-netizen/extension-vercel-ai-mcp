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

function wrapTools(tools: Record<string, any>, emit: (event: any) => void): Record<string, any> {
  const wrapped: Record<string, any> = {};
  for (const [name, tool] of Object.entries(tools)) {
    const origExecute = tool.execute;
    wrapped[name] = {
      ...tool,
      execute: async (args: any, options: any) => {
        // Emit tool start event
        emit({ type: 'tool', name });

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

  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const emit = (event: any) => {
    writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  };

  // Run the agent in the background, streaming events
  (async () => {
    let mcpClient: any;
    try {
      mcpClient = await createMCPClient({
        transport: new StreamableHTTPClientTransport(
          new URL("https://session-mcp.webfu.se/mcp"),
          {
            requestInit: {
              headers: { Authorization: `Bearer ${restKey}` },
            },
          }
        ),
      });

      const rawTools = await mcpClient.tools();
      const tools = wrapTools(rawTools, emit);

      // Auto-read page on first message
      let contextMessages = [...messages];
      if (messages.length === 1 && messages[0].role === 'user') {
        try {
          emit({ type: 'tool', name: 'see_domSnapshot' });
          const readTool = rawTools['see_domSnapshot'];
          if (readTool) {
            const overview = await readTool.execute(
              { session_id: sessionId, options: { root: 'body', quality: 0.1 } },
              { abortSignal: AbortSignal.timeout(10000) } as any
            );
            const overviewStr = typeof overview === 'string' ? overview : JSON.stringify(overview);
            if (overviewStr.length > 50) {
              const trimmed = overviewStr.slice(0, 8000);
              contextMessages = [
                { role: 'user', content: '[Current page content]:\n' + trimmed + '\n\nUser question: ' + messages[0].content },
              ];
            }
          }
        } catch (e) {
          console.log('[auto-read error]', e);
        }
      }

      const { text } = await generateText({
        model: openai("gpt-4o"),
        system: `You are a browsing assistant controlling the user's CURRENT browser tab via Webfuse.
The user is already viewing a page. You can see and interact with it.

CRITICAL RULE: For EVERY user message, you MUST read the page first using see_domSnapshot before responding.
Never answer from your own knowledge. Never ask the user what they mean. The answer is always on the page.

RULES:
- ALWAYS pass session_id: "${sessionId}" to every tool call
- For see_domSnapshot, ALWAYS include options.root with a CSS selector
- The user is ALREADY on a page. Do not ask them for a URL.

READING STRATEGY:
1. Start with a page overview: use see_domSnapshot with options.root = "body" and options.quality = 0.1
2. For specific content: use a narrow CSS selector like "h1", ".infobox", "article"
3. If content is truncated, use a narrower selector

HACKER NEWS SPECIFIC:
- Each story has an ID visible in vote links like "vote?id=47350424"
- Comments page URL: https://news.ycombinator.com/item?id=<ID>
- To open comments: use navigate with the item URL

READING HN COMMENTS EFFICIENTLY:
- Use root selector ".comment-tree" with quality 0.3 to get comment text without page chrome
- If too long, use ".comtr:nth-child(-n+10)" to get just the first 10 comments
- Comments have nested replies — focus on top-level comments first
- When summarizing comments, group by theme and highlight insightful/controversial takes
- Keep summaries concise — users want the gist, not every detail

COMMENTING ON HN:
- Navigate to the comments page first (item?id=<ID>)
- Use act_type with target "textarea" to type the comment
- DO NOT submit. Let the user review.
- Write something witty for funny comments.

Be concise. Summarize what you find. Include ranks/numbers when listing items.`,
        messages: contextMessages,
        tools,
        maxSteps: 10,
      });

      emit({ type: 'text', content: text });
      emit({ type: 'done' });
    } catch (e) {
      emit({ type: 'error', content: String(e).slice(0, 500) });
    } finally {
      if (mcpClient) await mcpClient.close();
      writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      ...corsHeaders,
    },
  });
}
