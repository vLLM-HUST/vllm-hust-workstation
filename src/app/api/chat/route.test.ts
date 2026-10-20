// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const metrics = vi.hoisted(() => ({
  beginChatRequest: vi.fn(),
  estimateTokenCount: vi.fn(() => 7),
  finishChatRequest: vi.fn(),
  recordApiRequest: vi.fn(),
  recordUpstreamRequest: vi.fn(),
}));
const webSearch = vi.hoisted(() => ({ getWebSearchContext: vi.fn() }));

vi.mock("@/lib/config", () => ({
  SERVER_CONFIG: { baseUrl: "http://upstream.invalid" },
}));
vi.mock("@/lib/runtimeSecret", () => ({ getServerApiKey: () => "test-key" }));
vi.mock("@/lib/server/webSearch", () => webSearch);
vi.mock("@/lib/metrics", () => metrics);

import { POST } from "./route";

const RESPONSES_SSE = [
  'data: {"type":"response.created","response":{"model":"Qwen3.8-27B"}}',
  'data: {"type":"response.reasoning_text.delta","delta":"先分析。"}',
  'data: {"type":"response.reasoning_text.delta","delta":"再确认。"}',
  'data: {"type":"response.output_text.delta","delta":"答案。"}',
  'data: {"type":"response.completed","response":{"model":"Qwen3.8-27B"}}',
  "",
].join("\n\n");

function request(stream = true, overrides: Record<string, unknown> = {}): NextRequest {
  return new NextRequest("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "测试" }],
      model: "Qwen/Qwen3.8-27B",
      stream,
      ...overrides,
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  metrics.estimateTokenCount.mockReturnValue(7);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Responses API chat adapter", () => {
  it("forwards the unconfigured browser fallback and preserves a long native-thinking stream to final answer", async () => {
    vi.stubEnv("WORKSTATION_DEFAULT_MAX_TOKENS", undefined);
    try {
      const reasoning = "原生思考增量。".repeat(5000);
      const events = [
        {type:"response.reasoning_text.delta",delta:reasoning},
        {type:"response.output_text.delta",delta:"最终答案：4 GiB，分别翻倍均为8 GiB。"},
        {type:"response.completed",response:{status:"completed",usage:{output_tokens:8192}}},
      ];
      const fetch = vi.fn().mockResolvedValue(new Response(events.map(event=>
        'data: '+JSON.stringify(event)+'\n\n').join(''),{headers:{"Content-Type":"text/event-stream"}}));
      vi.stubGlobal("fetch",fetch);
      const text = await (await POST(request(true,{enable_thinking:true}))).text();
      expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
        max_output_tokens:32768,chat_template_kwargs:{enable_thinking:true},stream:true,
      });
      expect(text).toContain(reasoning);
      expect(text).toContain('最终答案：4 GiB');
      expect(text).toContain('"finish_reason":"stop"');
      expect(text).toContain('"completion_tokens":8192');
      expect(text).toContain('[DONE]');
      expect(metrics.finishChatRequest).toHaveBeenCalledWith(expect.objectContaining({status:"completed"}));
    } finally { vi.unstubAllEnvs(); }
  });

  it("passes the real default budget and thinking flag to fetch", async () => {
    vi.stubEnv("WORKSTATION_DEFAULT_MAX_TOKENS", "32768");
    const fetch = vi.fn().mockResolvedValue(Response.json({status:"completed",output_text:"答案"}));
    vi.stubGlobal("fetch",fetch);
    const response = await POST(request(false,{enable_thinking:true}));
    expect(response.status).toBe(200);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      max_output_tokens:32768,chat_template_kwargs:{enable_thinking:true},
    });
    vi.unstubAllEnvs();
  });

  it.each([
    ["", "response.completed", {status:"completed"}, "stop", "empty"],
    ["部分正文", "response.incomplete", {status:"incomplete",incomplete_details:{reason:"max_output_tokens"}}, "length", "truncated"],
    ["部分正文", "response.failed", {status:"failed"}, "error", "failed"],
    ["部分正文", "response.cancelled", {status:"cancelled"}, "cancelled", "cancelled"],
    ["部分正文", null, {}, "incomplete", "interrupted"],
  ])("preserves terminal semantics %s / %s", async (content,type,response,finish,status) => {
    const events = [{type:"response.reasoning_text.delta",delta:"思考不是最终答案"},
      ...(content ? [{type:"response.output_text.delta",delta:content}] : []),
      ...(type ? [{type,response}] : [])];
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(events.map(e => 'data: '+JSON.stringify(e)+'\r\n\r\n').join(''),
      {headers:{"Content-Type":"text/event-stream"}})));
    const text = await (await POST(request())).text();
    expect(text).toContain('"finish_reason":"'+finish+'"');
    expect(text).toContain('"status":"'+status+'"');
    expect(text).toContain('[DONE]');
    expect(metrics.finishChatRequest).toHaveBeenCalledWith(expect.objectContaining({status:"failed"}));
    expect(text).not.toContain('"content":"思考不是最终答案"');
  });

  it("reports a mid-stream read failure without losing partial answer", async () => {
    let read = 0;
    const upstream = new ReadableStream({pull(controller) {
      if (read++ === 0) controller.enqueue(new TextEncoder().encode('data: {"type":"response.output_text.delta","delta":"部分答案"}\n\n'));
      else controller.error(new Error('synthetic disconnect'));
    }});
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(upstream)));
    const text = await (await POST(request())).text();
    expect(text).toContain('部分答案');
    expect(text).toContain('"finish_reason":"error"');
    expect(text).not.toContain('"finish_reason":"stop"');
  });

  it("propagates browser cancellation to the upstream reader and fetch signal", async () => {
    const cancel = vi.fn();
    const upstream = new ReadableStream({cancel});
    const fetch = vi.fn().mockResolvedValue(new Response(upstream));
    vi.stubGlobal("fetch",fetch);
    const response = await POST(request());
    await response.body!.cancel('synthetic user stop');
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(cancel).toHaveBeenCalled();
    expect(metrics.finishChatRequest).toHaveBeenCalledWith(expect.objectContaining({status:"failed"}));
  });
  it("converts Responses reasoning and answer deltas to chat chunks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(RESPONSES_SSE, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        })
      )
    );

    const response = await POST(request());
    const responseText = await response.text();
    expect(responseText).toContain('"reasoning":"先分析。"');
    expect(responseText).toContain('"content":"答案。"');
    expect(responseText).toContain('"model":"Qwen3.8-27B"');
    expect(responseText).toContain("data: [DONE]");
    expect(metrics.estimateTokenCount).toHaveBeenCalledWith("先分析。再确认。\n答案。");
    expect(metrics.finishChatRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "Qwen/Qwen3.8-27B",
        approxTokens: 7,
        status: "completed",
      })
    );
  });

  it("counts both reasoning and answer text in non-stream responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          id: "resp-test",
          status: "completed",
          model: "Qwen3.8-27B",
          output: [
            { type: "reasoning", content: [{ type: "reasoning_text", text: "分析" }] },
            { type: "message", content: [{ type: "output_text", text: "答案" }] },
          ],
        })
      )
    );

    const response = await POST(request(false));
    expect(response.status).toBe(200);
    expect(metrics.estimateTokenCount).toHaveBeenCalledWith("分析\n答案");
    expect(await response.json()).toMatchObject({
      model: "Qwen3.8-27B",
      choices: [{ message: { reasoning: "分析", content: "答案" } }],
    });
  });

  it("sends request-level model selection through the Responses wire format", async () => {
    const upstreamFetch = vi.fn().mockResolvedValue(
      Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "好" }] }] })
    );
    vi.stubGlobal("fetch", upstreamFetch);

    await POST(request(false, { model: "sage-auto", max_tokens: 77, enable_thinking: false }));
    expect(upstreamFetch.mock.calls[0][0]).toBe("http://upstream.invalid/v1/responses");
    const upstreamBody = JSON.parse(
      (upstreamFetch.mock.calls[0][1] as RequestInit).body as string
    );
    expect(upstreamBody).toMatchObject({
      model: "sage-auto",
      input: expect.any(Array),
      stream: false,
      max_output_tokens: 77,
      chat_template_kwargs: { enable_thinking: false },
    });
    expect(upstreamBody).not.toHaveProperty("messages");
    expect(upstreamBody).not.toHaveProperty("max_tokens");
    expect(upstreamBody).not.toHaveProperty("enable_thinking");
  });
});

describe("chat search context injection", () => {
  const question = "请只用一句中文回答：天空为什么是蓝色？";

  it("leaves the original question untouched when retrieval has no relevant result", async () => {
    webSearch.getWebSearchContext.mockResolvedValue({
      enabled: true,
      attempted: true,
      mode: "workstation-context",
      query: "天空为什么是蓝色",
      results: [],
      context: "",
    });
    const upstreamFetch = vi.fn().mockResolvedValue(
      Response.json({
        status: "completed",
        output: [
          { type: "message", content: [{ type: "output_text", text: "蓝光更容易被大气散射。" }] },
        ],
      })
    );
    vi.stubGlobal("fetch", upstreamFetch);

    const response = await POST(
      request(false, {
        web_search: true,
        messages: [{ role: "user", content: question }],
      })
    );
    const upstreamBody = JSON.parse(
      (upstreamFetch.mock.calls[0][1] as RequestInit).body as string
    );
    expect(upstreamBody.input.at(-1)).toEqual({ role: "user", content: question });
    expect(await response.json()).toMatchObject({
      search: { query: "天空为什么是蓝色", results: [] },
    });
  });

  it("injects only the relevance-gated context while preserving the user question", async () => {
    const context = "【联网搜索参考】相关结果。";
    webSearch.getWebSearchContext.mockResolvedValue({
      enabled: true,
      attempted: true,
      mode: "workstation-context",
      query: "天空为什么是蓝色",
      results: [
        { title: "天空为何呈蓝色", url: "https://example.com/sky", snippet: "瑞利散射" },
      ],
      context,
    });
    const upstreamFetch = vi.fn().mockResolvedValue(
      Response.json({
        status: "completed",
        output: [
          { type: "message", content: [{ type: "output_text", text: "蓝光更容易被大气散射。" }] },
        ],
      })
    );
    vi.stubGlobal("fetch", upstreamFetch);

    await POST(
      request(false, {
        web_search: true,
        messages: [{ role: "user", content: question }],
      })
    );
    const upstreamBody = JSON.parse(
      (upstreamFetch.mock.calls[0][1] as RequestInit).body as string
    );
    expect(upstreamBody.input.at(-1)).toEqual({
      role: "user",
      content: `${context}\n用户问题：${question}`,
    });
  });
});
