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
import { ChatSseDecoder, classifyCompletion } from "@/lib/chatStream";
import { buildResponsesRequest } from "@/lib/chatRequest";
import {
  extractResponsesStreamDelta,
  extractResponsesText,
  responseModel,
  responsesTerminal,
  chatUsage,
  type ResponsesTerminal,
} from "@/lib/responsesAdapter";
 

export const runtime = "nodejs";

const THINKING_BUDGET_SYSTEM_PROMPT =
  process.env.WORKSTATION_SYSTEM_PROMPT ||
  "你是一个有用的AI助手。请给出清晰、准确、完整的回答。";
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
  let upstreamBody;
  try {
    upstreamBody = buildResponsesRequest(body, outboundMessages);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
  const upstreamAbort = new AbortController();

  const requestStart = performance.now();
  beginChatRequest();

  try {
    const upstreamStart = performance.now();
    const response = await fetch(upstream, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getServerApiKey()}`,
      },
      body: JSON.stringify(upstreamBody),
      signal: AbortSignal.any([req.signal, upstreamAbort.signal]),
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
      const terminal = responsesTerminal(payload)!;
      const completion = classifyCompletion(generatedFields.content, terminal.finishReason, true);
      const generated = [generatedFields.reasoning, generatedFields.content]
        .filter(Boolean)
        .join("\n");
      const totalDurationSeconds = (performance.now() - requestStart) / 1000;
      finishChatRequest({
        model,
        durationSeconds: totalDurationSeconds,
        approxTokens: estimateTokenCount(generated),
        status: completion.status === "completed" ? "completed" : "failed",
      });
      recordApiRequest("/api/chat", "POST", completion.status === "completed" ? 200 : 502, totalDurationSeconds);

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
            finish_reason: terminal.finishReason,
          },
        ],
        usage: chatUsage(payload?.usage),
        completion,
        ...(completion.status === "empty" || completion.status === "failed" || completion.status === "interrupted"
          ? { error: completion.message } : {}),
        search: searchAttempted
          ? { query: searchQuery, results: searchResults }
          : undefined,
      }, { status: ["empty", "failed", "interrupted"].includes(completion.status) ? 502 : 200 });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    // The body is transformed: never forward upstream length/encoding headers.
    const headers = new Headers({ "Content-Type": "text/event-stream; charset=utf-8" });
    response.headers.forEach((value, key) => {
      if (key.startsWith("x-sage-")) headers.set(key, value);
    });
    headers.set("Cache-Control", "no-cache");
    headers.set("Connection", "keep-alive");

    const sse = new ChatSseDecoder();
    let generatedText = "";
    let generatedReasoning = "";
    let routedModel = model;
    let finalized = false;
    let terminal: ResponsesTerminal | null = null;
    let cancelled = false;

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
        status === "completed" ? 200 : cancelled ? 499 : 502,
        durationSeconds
      );
    };

    const streamBody = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (payload: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        const processEvents = (text: string, eof = false) => {
          for (const event of sse.push(text, eof)) {
            if (event.kind !== "payload") continue;
            const discoveredModel = responseModel(event.payload);
            if (discoveredModel) routedModel = discoveredModel;
            const end = responsesTerminal(event.payload, true);
            if (end) {
              if (terminal) throw new Error("duplicate upstream terminal event");
              terminal = end;
              continue;
            }
            const delta = extractResponsesStreamDelta(event.payload);
            if (!delta.content && !delta.reasoning) continue;
            if (terminal) throw new Error("text after upstream terminal event");
            generatedText += delta.content;
            generatedReasoning += delta.reasoning;
            send({ id: "ws-responses-proxy", object: "chat.completion.chunk", model: routedModel,
              choices: [{ index: 0, delta, finish_reason: null }] });
          }
        };
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
              processEvents(decoder.decode(), true);
              const finishReason = terminal?.finishReason ?? "incomplete";
              const completion = classifyCompletion(generatedText, finishReason, terminal !== null);
              send({ id: "ws-responses-proxy", object: "chat.completion.chunk", model: routedModel,
                choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
                usage: chatUsage(terminal?.usage), completion });
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              finalize(completion.status === "completed" ? "completed" : "failed");
              controller.close();
              return;
            }

            if (value) {
              processEvents(decoder.decode(value, { stream: true }));
            }
          }
        } catch {
          finalize("failed");
          if (!cancelled) {
            send({ choices: [{ index: 0, delta: {}, finish_reason: "error" }],
              error: { code: "upstream_stream_error", message: "上游响应中断，生成未完成。" } });
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          }
        } finally {
          reader.releaseLock();
        }
      },
      async cancel(reason) {
        cancelled = true;
        upstreamAbort.abort();
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
