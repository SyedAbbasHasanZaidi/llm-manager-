import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDecryptedKey } from "@/lib/keys";
import { getDecryptedMCPKey } from "@/lib/mcp-keys";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Mistral } from "@mistralai/mistralai";

// Prevent Vercel from caching this route — SSE streams must always be dynamic
export const dynamic = "force-dynamic";

// ── /api/chat ─────────────────────────────────────────────────────────────────
// Accepts:  POST { model, messages, tools?, mcpServerIds? }
// Returns:  SSE stream of StreamEvents
//
// API keys are fetched server-side from Supabase (never exposed to the client).
// Provider selection is based on the model ID prefix.
// When the LLM calls a tool, the server executes it and feeds the result back.

const PROVIDER_MAP: Record<string, string> = {
  "claude":    "anthropic",
  "gpt":       "openai",
  "o3":        "openai",
  "o4":        "openai",
  "gemini":    "google",
  "mistral":   "mistral",
  "codestral": "mistral",
  "command":   "cohere",
};

function detectProvider(modelId: string): string {
  for (const [prefix, provider] of Object.entries(PROVIDER_MAP)) {
    if (modelId.toLowerCase().startsWith(prefix)) return provider;
  }
  return "unknown";
}

// Max number of tool call round-trips before forcing a text response
const MAX_TOOL_ROUNDS = 5;

export async function POST(req: NextRequest) {
  // ── Auth check
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await req.json();
  const { model, messages, tools = [] } = body as {
    model:    string;
    messages: Array<{ role: string; content: string }>;
    tools:    unknown[];
  };

  if (!model || !messages?.length) {
    return new Response("Missing model or messages", { status: 400 });
  }

  const provider = detectProvider(model);

  // ── Fetch the user's API key from Supabase (server-side, decrypted)
  const apiKey = await getDecryptedKey(user.id, provider);
  if (!apiKey) {
    return new Response(`No API key saved for provider: ${provider}`, { status: 401 });
  }

  // ── Load MCP server credentials for tool execution
  // Fetch user's enabled MCP servers and their keys for tool execution
  const { data: mcpRows } = await supabase
    .from("mcp_servers")
    .select("id, name")
    .eq("user_id", user.id)
    .eq("enabled", true);

  const mcpKeys: Record<string, string> = {};
  for (const srv of mcpRows ?? []) {
    const key = await getDecryptedMCPKey(srv.id, user.id);
    if (key) mcpKeys[srv.name.toLowerCase()] = key;
  }

  // ── Set up SSE stream
  const encoder = new TextEncoder();
  const stream  = new ReadableStream({
    async start(controller) {
      const emit = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        if (provider === "anthropic") {
          await streamAnthropic({ model, messages, tools, apiKey, emit, mcpKeys });
        } else if (provider === "openai") {
          await streamOpenAI({ model, messages, tools, apiKey, emit, mcpKeys });
        } else if (provider === "google") {
          await streamGoogle({ model, messages, tools, apiKey, emit, mcpKeys });
        } else if (provider === "mistral") {
          await streamMistral({ model, messages, tools, apiKey, emit, mcpKeys });
        } else if (provider === "cohere") {
          await streamCohere({ model, messages, tools, apiKey, emit, mcpKeys });
        } else {
          emit({ type: "error", messageId: "", payload: `Unsupported provider: ${provider}` });
        }
      } catch (err: unknown) {
        emit({ type: "error", messageId: "", payload: (err as Error).message });
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
    },
  });
}

// ─── Provider adapters ────────────────────────────────────────────────────────

type Emit = (data: object) => void;

interface AdapterArgs {
  model:    string;
  messages: Array<{ role: string; content: string }>;
  tools:    unknown[];
  apiKey:   string;
  emit:     Emit;
  mcpKeys?: Record<string, string>;
}

// ── Anthropic (with tool execution loop) ─────────────────────────────────────

async function streamAnthropic({ model, messages, tools, apiKey, emit, mcpKeys }: AdapterArgs) {
  const client = new Anthropic({ apiKey });

  // Build message history for Anthropic format
  let anthropicMessages: Anthropic.MessageParam[] = messages.map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = await client.messages.stream({
      model,
      max_tokens: 4096,
      messages: anthropicMessages,
      tools: tools.length > 0 ? tools as Anthropic.Tool[] : undefined,
    });

    let hasToolUse = false;
    const toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
    const textParts: string[] = [];

    for await (const event of stream) {
      if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          const msg = stream.currentMessage;
          emit({ type: "text_delta", messageId: msg?.id ?? "", payload: event.delta.text });
          textParts.push(event.delta.text);
        }
      }

      if (event.type === "content_block_stop") {
        const msg = stream.currentMessage;
        if (msg) {
          const block = msg.content[event.index];
          if (block?.type === "tool_use") {
            hasToolUse = true;
            toolUseBlocks.push({
              id:    block.id,
              name:  block.name,
              input: block.input as Record<string, unknown>,
            });
          }
        }
      }

      if (event.type === "message_delta" && event.usage) {
        const msg          = stream.currentMessage;
        const inputTokens  = msg?.usage?.input_tokens ?? 0;
        const outputTokens = event.usage.output_tokens;

        // Only emit message_done if this is the final round (no tool calls)
        if (!hasToolUse) {
          emit({ type: "message_done", messageId: msg?.id ?? "", payload: {
            tokenCount: inputTokens + outputTokens,
            cost: (inputTokens * 0.000003) + (outputTokens * 0.000015),
          }});
        }
      }
    }

    // If no tool calls, we're done
    if (!hasToolUse || toolUseBlocks.length === 0) break;

    // Execute tool calls and build results
    const assistantContent: Anthropic.ContentBlockParam[] = [];
    if (textParts.length > 0) {
      assistantContent.push({ type: "text", text: textParts.join("") });
    }
    for (const tc of toolUseBlocks) {
      assistantContent.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tc of toolUseBlocks) {
      emit({ type: "tool_start", messageId: "", payload: { id: tc.id, name: tc.name, input: tc.input } });

      const start = Date.now();
      const result = await executeTool(tc.name, tc.input, mcpKeys ?? {});
      const durationMs = Date.now() - start;

      emit({ type: "tool_result", messageId: "", payload: { id: tc.id, result, durationMs } });

      toolResults.push({
        type:       "tool_result",
        tool_use_id: tc.id,
        content:    typeof result === "string" ? result : JSON.stringify(result),
      });
    }

    // Append assistant response + tool results to messages for next round
    anthropicMessages = [
      ...anthropicMessages,
      { role: "assistant", content: assistantContent },
      { role: "user", content: toolResults },
    ];
  }
}

// ── OpenAI (with tool execution loop) ────────────────────────────────────────

async function streamOpenAI({ model, messages, tools, apiKey, emit, mcpKeys }: AdapterArgs) {
  const client = new OpenAI({ apiKey });

  let openaiMessages: OpenAI.ChatCompletionMessageParam[] =
    messages as OpenAI.ChatCompletionMessageParam[];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = await client.chat.completions.create({
      model,
      stream: true,
      stream_options: { include_usage: true },
      messages: openaiMessages,
      tools: tools.length > 0 ? tools as OpenAI.ChatCompletionTool[] : undefined,
    });

    let lastId = "";
    const toolCalls: Array<{ index: number; id: string; name: string; arguments: string }> = [];
    let hasToolCalls = false;

    for await (const chunk of stream) {
      lastId = chunk.id ?? lastId;
      const choice = chunk.choices[0];

      // Text delta
      const delta = choice?.delta?.content ?? "";
      if (delta) emit({ type: "text_delta", messageId: lastId, payload: delta });

      // Accumulate tool calls from streaming deltas
      if (choice?.delta?.tool_calls) {
        hasToolCalls = true;
        for (const tc of choice.delta.tool_calls) {
          let existing = toolCalls.find(t => t.index === tc.index);
          if (!existing) {
            existing = { index: tc.index, id: tc.id ?? "", name: tc.function?.name ?? "", arguments: "" };
            toolCalls.push(existing);
          }
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.name = tc.function.name;
          if (tc.function?.arguments) existing.arguments += tc.function.arguments;
        }
      }

      // Usage on final chunk
      if (chunk.usage && !hasToolCalls) {
        emit({ type: "message_done", messageId: lastId, payload: {
          tokenCount: chunk.usage.total_tokens,
          cost: (chunk.usage.prompt_tokens * 0.000005) + (chunk.usage.completion_tokens * 0.000015),
        }});
      }
    }

    // If no tool calls, we're done
    if (!hasToolCalls || toolCalls.length === 0) break;

    // Execute tool calls
    const assistantMsg: OpenAI.ChatCompletionAssistantMessageParam = {
      role: "assistant",
      content: null,
      tool_calls: toolCalls.map(tc => ({
        id:       tc.id,
        type:     "function" as const,
        function: { name: tc.name, arguments: tc.arguments },
      })),
    };

    const toolResultMsgs: OpenAI.ChatCompletionToolMessageParam[] = [];
    for (const tc of toolCalls) {
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(tc.arguments); } catch { /* invalid JSON */ }

      emit({ type: "tool_start", messageId: lastId, payload: { id: tc.id, name: tc.name, input } });

      const start = Date.now();
      const result = await executeTool(tc.name, input, mcpKeys ?? {});
      const durationMs = Date.now() - start;

      emit({ type: "tool_result", messageId: lastId, payload: { id: tc.id, result, durationMs } });

      toolResultMsgs.push({
        role:         "tool",
        tool_call_id: tc.id,
        content:      typeof result === "string" ? result : JSON.stringify(result),
      });
    }

    openaiMessages = [...openaiMessages, assistantMsg, ...toolResultMsgs];
  }
}

// ── Google (with tool execution loop) ────────────────────────────────────────

async function streamGoogle({ model, messages, tools, apiKey, emit, mcpKeys }: AdapterArgs) {
  const genAI    = new GoogleGenerativeAI(apiKey);

  // Convert MCP tool schemas to Google function declarations
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const googleTools = tools.length > 0 ? [{
    functionDeclarations: (tools as Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>).map(t => ({
      name:        t.name,
      description: t.description,
      parameters:  t.inputSchema as any,
    })),
  }] as any : undefined;

  // Build contents array (supports multi-turn with function calls/results)
  type GeminiPart = { text: string } | { functionCall: { name: string; args: Record<string, unknown> } } | { functionResponse: { name: string; response: Record<string, unknown> } };
  type GeminiContent = { role: string; parts: GeminiPart[] };

  let contents: GeminiContent[] = messages.map(m => ({
    role:  m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const msgId = "gemini_" + Math.random().toString(36).slice(2);
  let totalChars = 0;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const genModel = genAI.getGenerativeModel({ model, tools: googleTools });
    const result   = await genModel.generateContentStream({ contents });

    let hasToolCalls = false;
    const functionCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        emit({ type: "text_delta", messageId: msgId, payload: text });
        totalChars += text.length;
      }

      // Check for function calls in candidates
      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if ("functionCall" in part && part.functionCall) {
          hasToolCalls = true;
          functionCalls.push({
            name: part.functionCall.name,
            args: (part.functionCall.args ?? {}) as Record<string, unknown>,
          });
        }
      }
    }

    if (!hasToolCalls || functionCalls.length === 0) break;

    // Execute tools and build response
    const modelParts: GeminiPart[] = [];
    const responseParts: GeminiPart[] = [];

    for (const fc of functionCalls) {
      modelParts.push({ functionCall: { name: fc.name, args: fc.args } });

      const toolId = crypto.randomUUID();
      emit({ type: "tool_start", messageId: msgId, payload: { id: toolId, name: fc.name, input: fc.args } });

      const start = Date.now();
      const result = await executeTool(fc.name, fc.args, mcpKeys ?? {});
      const durationMs = Date.now() - start;

      emit({ type: "tool_result", messageId: msgId, payload: { id: toolId, result, durationMs } });

      responseParts.push({
        functionResponse: {
          name: fc.name,
          response: typeof result === "object" && result !== null ? result as Record<string, unknown> : { result },
        },
      });
    }

    contents = [
      ...contents,
      { role: "model", parts: modelParts },
      { role: "user", parts: responseParts },
    ];
  }

  const estimatedTokens = Math.ceil(totalChars / 4);
  emit({ type: "message_done", messageId: msgId, payload: {
    tokenCount: estimatedTokens,
    cost: estimatedTokens * 0.0000001,
  }});
}

// ── Mistral (with tool execution loop) ───────────────────────────────────────

async function streamMistral({ model, messages, tools, apiKey, emit, mcpKeys }: AdapterArgs) {
  const client = new Mistral({ apiKey });

  // Convert tools to Mistral format
  const mistralTools = tools.length > 0 ? (tools as Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>).map(t => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  })) : undefined;

  type MistralMsg = Parameters<typeof client.chat.stream>[0]["messages"][number];
  let mistralMessages: MistralMsg[] = messages as MistralMsg[];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = await client.chat.stream({
      model,
      messages: mistralMessages,
      tools: mistralTools,
    });

    let lastId = "mistral_" + Math.random().toString(36).slice(2);
    let hasToolCalls = false;
    const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];

    for await (const event of stream) {
      const rawDelta = event.data.choices[0]?.delta?.content;
      const delta = typeof rawDelta === "string" ? rawDelta : "";
      if (delta) emit({ type: "text_delta", messageId: event.data.id ?? lastId, payload: delta });
      lastId = event.data.id ?? lastId;

      // Accumulate tool calls
      const dtc = event.data.choices[0]?.delta?.toolCalls;
      if (dtc) {
        hasToolCalls = true;
        for (const tc of dtc) {
          const existing = toolCalls.find(t => t.id === tc.id);
          const argStr = typeof tc.function?.arguments === "string" ? tc.function.arguments : JSON.stringify(tc.function?.arguments ?? "");
          if (existing) {
            if (argStr) existing.arguments += argStr;
          } else {
            toolCalls.push({
              id:        tc.id ?? crypto.randomUUID(),
              name:      tc.function?.name ?? "",
              arguments: argStr,
            });
          }
        }
      }

      if (event.data.choices[0]?.finishReason && !hasToolCalls) {
        const usage = event.data.usage;
        emit({ type: "message_done", messageId: lastId, payload: {
          tokenCount: usage?.totalTokens ?? 0,
          cost: ((usage?.promptTokens ?? 0) * 0.000002) + ((usage?.completionTokens ?? 0) * 0.000006),
        }});
      }
    }

    if (!hasToolCalls || toolCalls.length === 0) break;

    // Execute tool calls
    const assistantMsg = {
      role: "assistant" as const,
      content: "",
      toolCalls: toolCalls.map(tc => ({
        id:       tc.id,
        type:     "function" as const,
        function: { name: tc.name, arguments: tc.arguments },
      })),
    };

    const toolResultMsgs: MistralMsg[] = [];
    for (const tc of toolCalls) {
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(tc.arguments); } catch { /* invalid JSON */ }

      emit({ type: "tool_start", messageId: lastId, payload: { id: tc.id, name: tc.name, input } });

      const start = Date.now();
      const result = await executeTool(tc.name, input, mcpKeys ?? {});
      const durationMs = Date.now() - start;

      emit({ type: "tool_result", messageId: lastId, payload: { id: tc.id, result, durationMs } });

      toolResultMsgs.push({
        role:    "tool" as const,
        name:    tc.name,
        content: typeof result === "string" ? result : JSON.stringify(result),
        toolCallId: tc.id,
      } as MistralMsg);
    }

    mistralMessages = [...mistralMessages, assistantMsg as MistralMsg, ...toolResultMsgs];
  }
}

// ── Cohere (with tool execution loop) ────────────────────────────────────────

async function streamCohere({ model, messages, tools, apiKey, emit, mcpKeys }: AdapterArgs) {
  const { CohereClientV2 } = await import("cohere-ai");
  const client = new CohereClientV2({ token: apiKey });

  // Convert tools to Cohere V2 format
  const cohereTools = tools.length > 0 ? (tools as Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>).map(t => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  })) : undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cohereMessages: any[] = messages.map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const msgId = "cohere_" + Math.random().toString(36).slice(2);

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = await client.chatStream({
      model,
      messages: cohereMessages,
      tools: cohereTools,
    });

    let hasToolCalls = false;
    const toolCallsList: Array<{ id: string; name: string; arguments: string }> = [];

    for await (const event of stream) {
      if (event.type === "content-delta" && event.delta?.message?.content?.text) {
        emit({ type: "text_delta", messageId: msgId, payload: event.delta.message.content.text });
      }

      if (event.type === "tool-call-start" && event.delta?.message?.toolCalls) {
        hasToolCalls = true;
        const tc = event.delta.message.toolCalls;
        if (tc.id && tc.function?.name) {
          toolCallsList.push({ id: tc.id, name: tc.function.name, arguments: tc.function?.arguments ?? "" });
        }
      }

      if (event.type === "tool-call-delta" && event.delta?.message?.toolCalls) {
        const tc = event.delta.message.toolCalls;
        const existing = toolCallsList[toolCallsList.length - 1];
        if (existing && tc.function?.arguments) {
          existing.arguments += tc.function.arguments;
        }
      }

      if (event.type === "message-end" && !hasToolCalls) {
        const usage = event.delta?.usage;
        const inputTokens  = (usage?.billedUnits as Record<string, number>)?.inputTokens ?? 0;
        const outputTokens = (usage?.billedUnits as Record<string, number>)?.outputTokens ?? 0;
        emit({ type: "message_done", messageId: msgId, payload: {
          tokenCount: inputTokens + outputTokens,
          cost: (inputTokens * 0.0005) + (outputTokens * 0.0015),
        }});
      }
    }

    if (!hasToolCalls || toolCallsList.length === 0) break;

    // Execute tool calls
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolResults: any[] = [];
    for (const tc of toolCallsList) {
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(tc.arguments); } catch { /* invalid JSON */ }

      emit({ type: "tool_start", messageId: msgId, payload: { id: tc.id, name: tc.name, input } });

      const start = Date.now();
      const result = await executeTool(tc.name, input, mcpKeys ?? {});
      const durationMs = Date.now() - start;

      emit({ type: "tool_result", messageId: msgId, payload: { id: tc.id, result, durationMs } });

      toolResults.push({
        role:       "tool",
        toolCallId: tc.id,
        content:    typeof result === "string" ? result : JSON.stringify(result),
      });
    }

    cohereMessages = [
      ...cohereMessages,
      {
        role: "assistant",
        content: "",
        toolCalls: toolCallsList.map(tc => ({
          id:       tc.id,
          type:     "function" as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      },
      ...toolResults,
    ];
  }
}

// ─── Tool execution ──────────────────────────────────────────────────────────
// Executes an MCP tool by name. Handles built-in catalog tools directly using
// user's stored MCP credentials. Falls back to MCP SDK for custom HTTP servers.

async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  mcpKeys: Record<string, string>,
): Promise<unknown> {
  try {
    // ── Brave Search ──
    if (toolName === "brave_search" || toolName === "brave_news") {
      const key = mcpKeys["brave search"];
      if (!key) return { error: "No Brave Search API key configured" };
      const q = encodeURIComponent(String(input.query ?? ""));
      const endpoint = toolName === "brave_news"
        ? `https://api.search.brave.com/res/v1/news/search?q=${q}&count=5`
        : `https://api.search.brave.com/res/v1/web/search?q=${q}&count=5`;
      const res = await fetch(endpoint, { headers: { "X-Subscription-Token": key, Accept: "application/json" } });
      if (!res.ok) return { error: `Brave API ${res.status}: ${await res.text()}` };
      return await res.json();
    }

    // ── Fetch URL ──
    if (toolName === "fetch_url" || toolName === "fetch_links") {
      const url = String(input.url ?? "");
      if (!url) return { error: "URL is required" };
      const res = await fetch(url, { headers: { "User-Agent": "LLM-Manager/1.0" } });
      if (!res.ok) return { error: `Fetch failed ${res.status}` };
      const text = await res.text();
      if (toolName === "fetch_links") {
        const links = [...text.matchAll(/href="(https?:\/\/[^"]+)"/g)].map(m => m[1]).slice(0, 20);
        return { links };
      }
      return { content: text.slice(0, 8000), truncated: text.length > 8000 };
    }

    // ── GitHub ──
    if (toolName.startsWith("github_")) {
      const token = mcpKeys["github"];
      if (!token) return { error: "No GitHub token configured" };
      const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "LLM-Manager" };

      if (toolName === "github_search_repos") {
        const q = encodeURIComponent(String(input.query ?? ""));
        const res = await fetch(`https://api.github.com/search/repositories?q=${q}&per_page=5`, { headers });
        return await res.json();
      }
      if (toolName === "github_read_file") {
        const { owner, repo, path } = input as { owner: string; repo: string; path: string };
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, { headers });
        const data = await res.json();
        if (data.content) {
          return { ...data, content: Buffer.from(data.content, "base64").toString("utf-8") };
        }
        return data;
      }
      if (toolName === "github_list_issues") {
        const { owner, repo } = input as { owner: string; repo: string };
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=10`, { headers });
        return await res.json();
      }
    }

    // ── Notion ──
    if (toolName.startsWith("notion_")) {
      const token = mcpKeys["notion"];
      if (!token) return { error: "No Notion token configured" };
      const headers: Record<string, string> = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Notion-Version": "2022-06-28" };

      if (toolName === "notion_search") {
        const res = await fetch("https://api.notion.com/v1/search", {
          method: "POST", headers,
          body: JSON.stringify({ query: String(input.query ?? ""), page_size: 5 }),
        });
        return await res.json();
      }
      if (toolName === "notion_read_page") {
        const res = await fetch(`https://api.notion.com/v1/blocks/${input.pageId}/children`, { headers });
        return await res.json();
      }
      if (toolName === "notion_create_page") {
        const parentId = String(input.parentId ?? input.parent_id ?? "");
        if (!parentId) return { error: "parentId is required for notion_create_page" };
        const res = await fetch("https://api.notion.com/v1/pages", {
          method: "POST", headers,
          body: JSON.stringify({
            parent: { page_id: parentId },
            properties: { title: { title: [{ text: { content: String(input.title ?? "Untitled") } }] } },
            children: input.content ? [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ text: { content: String(input.content) } }] } }] : [],
          }),
        });
        return await res.json();
      }
    }

    // ── Slack ──
    if (toolName.startsWith("slack_")) {
      const token = mcpKeys["slack"];
      if (!token) return { error: "No Slack token configured" };

      if (toolName === "slack_post") {
        const res = await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ channel: input.channel, text: input.text }),
        });
        return await res.json();
      }
      if (toolName === "slack_read") {
        const res = await fetch(`https://slack.com/api/conversations.history?channel=${input.channel}&limit=10`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return await res.json();
      }
    }

    // ── PostgreSQL ──
    if (toolName === "pg_query" || toolName === "pg_schema") {
      const connStr = mcpKeys["postgresql"];
      if (!connStr) return { error: "No PostgreSQL connection string configured. Add it in MCP settings." };
      return { error: "PostgreSQL tool requires stdio transport which is not available in serverless. Use a hosted MCP server with HTTP transport instead." };
    }

    // ── SQLite ──
    if (toolName === "sqlite_query") {
      return { error: "SQLite tool requires stdio transport which is not available in serverless. Use a hosted MCP server with HTTP transport instead." };
    }

    // ── Filesystem ──
    if (toolName === "read_file" || toolName === "write_file" || toolName === "list_dir") {
      return { error: "Filesystem tool requires stdio transport which is not available in serverless. Use a hosted MCP server with HTTP transport instead." };
    }

    return { error: `Unknown tool: ${toolName}. If this is from a custom MCP server, ensure the server has an HTTP/SSE endpoint configured.` };
  } catch (err: unknown) {
    return { error: `Tool execution failed: ${(err as Error).message}` };
  }
}
