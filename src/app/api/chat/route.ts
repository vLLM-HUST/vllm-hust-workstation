import { SERVER_CONFIG } from "@/lib/config";
import { getServerApiKey } from "@/lib/runtimeSecret";
import { getWebSearchContext } from "@/lib/server/webSearch";
import {
  beginChatRequest,
  estimateTokenCount,
  finishChatRequest,
  recordApiRequest,
  recordUpstreamRequest,
} from "@/lib/metrics";
import { NextRequest } from "next/server";
import type { SearchResult } from "@/types";
import { parseChatSseLine } from "@/lib/chatStream";
import {
  extractResponsesStreamDelta,
  extractResponsesText,
  responseModel,
} from "@/lib/responsesAdapter";
 

export const runtime = "nodejs";

const DEFAULT_CHAT_MAX_TOKENS = Number(process.env.WORKSTATION_DEFAULT_MAX_TOKENS || "4096");

/** System prompt to keep Qwen3 thinking concise on resource-constrained NPU hardware */
const THINKING_BUDGET_SYSTEM_PROMPT =
  process.env.WORKSTATION_SYSTEM_PROMPT ||
  "你是一个有用的AI助手。思考时请简明扼要，将内部推理控制在200字以内，然后直接给出清晰完整的回答。";
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { messages, model, stream = true } = body;
  const doSearch = Boolean(body.web_search);
  const encoder = new TextEncoder();

  let searchResults: SearchResult[] = [];
  let searchQuery = "";
  let searchAttempted = false;
  let outboundMessages = Array.isArray(messages) ? [...messages] : [];

  // Prepend system prompt if none exists to constrain thinking verbosity
  if (!outboundMessages.some((m: { role: string }) => m.role === "system") && THINKING_BUDGET_SYSTEM_PROMPT) {
    outboundMessages = [
      { role: "system", content: THINKING_BUDGET_SYSTEM_PROMPT },
      ...outboundMessages,
    ];
  }

  if (doSearch) {
    const lastUserMessage = [...outboundMessages].reverse().find((message) => message?.role === "user");
    searchQuery = typeof lastUserMessage?.content === "string" ? lastUserMessage.content.slice(0, 200).trim() : "";
    if (searchQuery) {
      const searchContext = await getWebSearchContext(searchQuery, true);
      searchAttempted = searchContext.attempted;
      searchResults = searchContext.results;
      searchQuery = searchContext.query;
      if (searchContext.context) {
        outboundMessages = outboundMessages.map((message, index) => {
          if (index === outboundMessages.lastIndexOf(lastUserMessage)) {
            return {
              ...message,
              content: `${searchContext.context}\n用户问题：${message.content}`,
            };
          }
          return message;
        });
      }
    }
  }

  const upstream = `${SERVER_CONFIG.baseUrl}/v1/responses`;

  const requestStart = performance.now();
  beginChatRequest();

  try {
    const upstreamStart = performance.now();
    const responseOptions = { ...body };
    delete responseOptions.messages;
    delete responseOptions.max_tokens;
    delete responseOptions.web_search;
    delete responseOptions.enable_thinking;
    const upstreamBody = {
      ...responseOptions,
      model,
      input: outboundMessages,
      stream,
      max_output_tokens:
        typeof body?.max_tokens === "number" && Number.isFinite(body.max_tokens)
          ? body.max_tokens
          : DEFAULT_CHAT_MAX_TOKENS,
    };
    const response = await fetch(upstream, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getServerApiKey()}`,
      },
      body: JSON.stringify(upstreamBody),
    });
    recordUpstreamRequest(
      "/api/chat",
      "/v1/responses",
      response.status,
      (performance.now() - upstreamStart) / 1000
    );

    if (!response.ok || !response.body) {
      const err = await response.text();
      const totalDurationSeconds = (performance.now() - requestStart) / 1000;
      finishChatRequest({
        model,
        durationSeconds: totalDurationSeconds,
        approxTokens: 0,
        status: "failed",
      });
      recordApiRequest("/api/chat", "POST", response.status, totalDurationSeconds);
      const errorText = err.slice(0, 240).replace(/\n/g, " ");
      return Response.json(
        {
          error: errorText || "上游服务返回错误",
          search: searchAttempted
            ? {
                query: searchQuery,
                results: searchResults,
              }
            : undefined,
        },
        { status: response.status || 502 }
      );
    }

    const contentType = response.headers.get("content-type") || "";
    if (!stream && contentType.includes("application/json")) {
      const payload = await response.json();
      const generatedFields = extractResponsesText(payload);
      const generated = [generatedFields.reasoning, generatedFields.content]
        .filter(Boolean)
        .join("\n");
      const totalDurationSeconds = (performance.now() - requestStart) / 1000;
      finishChatRequest({
        model,
        durationSeconds: totalDurationSeconds,
        approxTokens: estimateTokenCount(generated),
        status: "completed",
      });
      recordApiRequest("/api/chat", "POST", 200, totalDurationSeconds);

      return Response.json({
        id: payload?.id,
        object: "chat.completion",
        model: payload?.model || model,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: generatedFields.content,
              reasoning: generatedFields.reasoning,
            },
            finish_reason: "stop",
          },
        ],
        usage: payload?.usage,
        search: searchAttempted
          ? { query: searchQuery, results: searchResults }
          : undefined,
      });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-cache");
    headers.set("Connection", "keep-alive");

    let sseBuffer = "";
    let generatedText = "";
    let generatedReasoning = "";
    let routedModel = model;
    let finalized = false;

    const finalize = (status: "completed" | "failed") => {
      if (finalized) {
        return;
      }
      finalized = true;
      const durationSeconds = (performance.now() - requestStart) / 1000;
      const approxTokens = estimateTokenCount(
        [generatedReasoning, generatedText].filter(Boolean).join("\n")
      );
      finishChatRequest({
        model,
        durationSeconds,
        approxTokens,
        status,
      });
      recordApiRequest(
        "/api/chat",
        "POST",
        status === "completed" ? 200 : 499,
        durationSeconds
      );
    };

    const streamBody = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          if (searchAttempted) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "search_results", query: searchQuery, results: searchResults })}\n\n`
              )
            );
          }

          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              finalize("completed");
              controller.close();
              return;
            }

            if (value) {
              const chunk = decoder.decode(value, { stream: true });
              sseBuffer += chunk;
              const lines = sseBuffer.split("\n");
              sseBuffer = lines.pop() ?? "";

              for (const line of lines) {
                const event = parseChatSseLine(line);
                if (event.kind !== "payload") {
                  continue;
                }
                const discoveredModel = responseModel(event.payload);
                if (discoveredModel) routedModel = discoveredModel;
                const delta = extractResponsesStreamDelta(event.payload);
                generatedText += delta.content;
                generatedReasoning += delta.reasoning;
                if (!delta.content && !delta.reasoning) {
                  continue;
                }
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      id: "ws-responses-proxy",
                      object: "chat.completion.chunk",
                      model: routedModel,
                      choices: [
                        {
                          index: 0,
                          delta: {
                            ...(delta.content ? { content: delta.content } : {}),
                            ...(delta.reasoning ? { reasoning: delta.reasoning } : {}),
                          },
                          finish_reason: null,
                        },
                      ],
                    })}\n\n`
                  )
                );
              }
            }
          }
        } catch (error) {
          finalize("failed");
          controller.error(error);
        }
      },
      async cancel(reason) {
        finalize("failed");
        await reader.cancel(reason);
      },
    });

    return new Response(streamBody, {
      status: 200,
      headers,
    });
  } catch (error) {
    const totalDurationSeconds = (performance.now() - requestStart) / 1000;
    finishChatRequest({
      model,
      durationSeconds: totalDurationSeconds,
      approxTokens: 0,
      status: "failed",
    });
    recordApiRequest("/api/chat", "POST", 500, totalDurationSeconds);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "upstream request failed",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
