/**
 * Unit tests for WorkstationClient streaming logic.
 *
 * Specifically tests the fallback behavior when a model generates
 * reasoning_content tokens but produces 0 regular content tokens.
 */
import { describe, it, expect } from "vitest";

// ─── Extracted logic under test ──────────────────────────────────────────────
// Mirror of parseThinkContent from WorkstationClient.tsx
function parseThinkContent(raw: string): { think: string; main: string } {
  const open = raw.indexOf("<think>");
  if (open === -1) {
    return { think: "", main: raw };
  }
  const close = raw.indexOf("</think>", open);
  if (close === -1) {
    return { think: raw.slice(open + 7), main: raw.slice(0, open) };
  }
  return {
    think: raw.slice(open + 7, close),
    main: raw.slice(0, open) + raw.slice(close + 8),
  };
}

/**
 * Simulates the core streaming loop logic from handleSend in WorkstationClient.tsx.
 * This mirrors the exact algorithm used in production.
 */
function simulateStreamingResponse(sseChunks: string[]): {
  fullContent: string;
  streamThink: string;
  firstTokenTs: number;
  tokensUsed: number;
} {
  let fullContent = "";
  let rawContent = "";
  let streamThink = "";
  let firstToken = true;
  let firstTokenTs = 0;
  const startTs = 1000; // simulated start time

  // Simulate the SSE streaming loop
  for (const chunk of sseChunks) {
    const lines = chunk.split("\n");

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;

      try {
        const json = JSON.parse(data);

        // reasoning_content handling (mirrors L308-L323 in WorkstationClient.tsx)
        const reasoningDelta = json.choices?.[0]?.delta?.reasoning_content ?? "";
        if (typeof reasoningDelta === "string" && reasoningDelta) {
          streamThink += reasoningDelta;
          if (firstToken) {
            firstTokenTs = startTs + 100; // simulate 100ms TTFT
            firstToken = false;
          }
        }

        // content handling (mirrors L314-L339)
        const delta = json.choices?.[0]?.delta?.content ?? "";
        if (delta) {
          if (firstToken) {
            firstTokenTs = startTs + 200;
            firstToken = false;
          }
          rawContent += delta;
          const parsed = parseThinkContent(rawContent);
          fullContent = parsed.main.trimStart() || parsed.main;
        }
      } catch {
        // skip malformed
      }
    }
  }

  // ─── Finally block logic (mirrors L387-L410) ────────────────────────────────
  // Fallback: if no regular content was generated but reasoning was, use reasoning
  if (!fullContent && streamThink) {
    fullContent = streamThink;
  }
  const finalContent = fullContent.trim();
  const words = finalContent.split(/\s+/).filter(Boolean).length;

  return {
    fullContent: finalContent,
    streamThink,
    firstTokenTs,
    tokensUsed: words,
  };
}

// ─── Helper to create SSE chunks ────────────────────────────────────────────
function makeSSEChunk(delta: {
  content?: string;
  reasoning_content?: string;
}): string {
  const payload = {
    choices: [{ delta, finish_reason: null }],
  };
  return `data: ${JSON.stringify(payload)}\n`;
}

// ─── Tests ───────────────────────────────────────────────────────────────────
describe("parseThinkContent", () => {
  it("returns full text as main when no <think> tag", () => {
    const result = parseThinkContent("Hello world");
    expect(result).toEqual({ think: "", main: "Hello world" });
  });

  it("extracts think content with open tag only (streaming)", () => {
    const result = parseThinkContent("<think>I am thinking about this...");
    expect(result).toEqual({
      think: "I am thinking about this...",
      main: "",
    });
  });

  it("extracts think and main content with complete tags", () => {
    const result = parseThinkContent(
      "<think>reasoning here</think>The final answer"
    );
    expect(result).toEqual({
      think: "reasoning here",
      main: "The final answer",
    });
  });
});

describe("Streaming fallback: reasoning_content only (no regular content)", () => {
  it("uses reasoning content as message when no content tokens are generated", () => {
    // Simulate a model that only generates reasoning_content, never content
    const chunks = [
      makeSSEChunk({ reasoning_content: "快速排序的基本思想是" }),
      makeSSEChunk({ reasoning_content: "选择一个基准元素，" }),
      makeSSEChunk({ reasoning_content: "将数组分成两部分。" }),
      "data: [DONE]\n",
    ];

    const result = simulateStreamingResponse(chunks);

    // The fallback should use reasoning content as the message
    expect(result.fullContent).toBe(
      "快速排序的基本思想是选择一个基准元素，将数组分成两部分。"
    );
    expect(result.streamThink).toBe(
      "快速排序的基本思想是选择一个基准元素，将数组分成两部分。"
    );
    expect(result.tokensUsed).toBeGreaterThan(0);
  });

  it("records TTFT from reasoning tokens when no content tokens arrive", () => {
    const chunks = [
      makeSSEChunk({ reasoning_content: "thinking..." }),
      "data: [DONE]\n",
    ];

    const result = simulateStreamingResponse(chunks);

    // firstTokenTs should be recorded (not 0)
    expect(result.firstTokenTs).toBeGreaterThan(0);
  });

  it("prefers regular content over reasoning when both are present", () => {
    const chunks = [
      makeSSEChunk({ reasoning_content: "I should use quicksort" }),
      makeSSEChunk({ content: "Here is the quicksort implementation:" }),
      makeSSEChunk({ content: "\ndef quicksort(arr): ..." }),
      "data: [DONE]\n",
    ];

    const result = simulateStreamingResponse(chunks);

    // Regular content should be used as the message, NOT reasoning
    expect(result.fullContent).toBe(
      "Here is the quicksort implementation:\ndef quicksort(arr): ..."
    );
    expect(result.streamThink).toBe("I should use quicksort");
  });

  it("handles empty stream gracefully (no reasoning, no content)", () => {
    const chunks = ["data: [DONE]\n"];

    const result = simulateStreamingResponse(chunks);

    expect(result.fullContent).toBe("");
    expect(result.streamThink).toBe("");
    expect(result.tokensUsed).toBe(0);
  });

  it("handles interleaved reasoning and content tokens", () => {
    const chunks = [
      makeSSEChunk({ reasoning_content: "Let me think..." }),
      makeSSEChunk({ reasoning_content: " about this." }),
      makeSSEChunk({ content: "Answer: " }),
      makeSSEChunk({ content: "42" }),
      "data: [DONE]\n",
    ];

    const result = simulateStreamingResponse(chunks);

    expect(result.fullContent).toBe("Answer: 42");
    expect(result.streamThink).toBe("Let me think... about this.");
  });

  it("handles long reasoning with no content (reproduces reported bug)", () => {
    // This reproduces the exact scenario from the screenshot:
    // Model generates extensive reasoning about quicksort but 0 output tokens
    const reasoningChunks = [
      "快速排序算法，是通过选择一个基准元素，",
      "将数组分成两部分，一部分比基准小，另一部分比基准大，",
      "然后递归地对这两部分排序。",
      "首先，我需要确定如何选择基准元素。",
      "常见的做法有选第一个元素、最后一个元素，或者中间元素，甚至随机选择。",
      "为了简单起见，可能选中间的元素或者最后一个元素比较容易实现。",
      "比如，这里可能用分治的方法，比如hoare分区或者lomuto分区。不过",
    ];

    const chunks = reasoningChunks.map((text) =>
      makeSSEChunk({ reasoning_content: text })
    );
    chunks.push("data: [DONE]\n");

    const result = simulateStreamingResponse(chunks);

    // Fallback should render the thinking text as the main content
    const expectedContent = reasoningChunks.join("");
    expect(result.fullContent).toBe(expectedContent);
    expect(result.tokensUsed).toBeGreaterThan(0);
    expect(result.firstTokenTs).toBeGreaterThan(0);
  });
});
