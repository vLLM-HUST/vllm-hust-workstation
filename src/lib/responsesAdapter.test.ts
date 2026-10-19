import { describe, expect, it } from "vitest";
import {
  extractResponsesStreamDelta,
  extractResponsesText,
  responseModel,
  responsesTerminal,
} from "./responsesAdapter";

describe("Responses API adapter", () => {
  it("honors incomplete inner status even when vLLM names the event completed", () => {
    expect(responsesTerminal({type:"response.completed",response:{status:"incomplete",
      incomplete_details:{reason:"max_output_tokens"},usage:{output_tokens:128}}},true))
      .toMatchObject({finishReason:"length",status:"incomplete",usage:{output_tokens:128}});
  });
  it("never invents completion from non-stream output without a status", () => {
    expect(responsesTerminal({output_text:"部分正文"})).toMatchObject({finishReason:"incomplete"});
  });
  it("retains all message output items instead of silently dropping later text", () => {
    expect(extractResponsesText({output:[
      {type:"message",content:[{type:"output_text",text:"第一段"}]},
      {type:"message",content:[{type:"output_text",text:"第二段"}]},
    ]}).content).toBe("第一段第二段");
  });
  it("extracts answer and reasoning from a completed response", () => {
    expect(
      extractResponsesText({
        output: [
          { type: "reasoning", content: [{ type: "reasoning_text", text: "分析" }] },
          { type: "message", content: [{ type: "output_text", text: "答案" }] },
        ],
      })
    ).toEqual({ content: "答案", reasoning: "分析" });
  });

  it("maps output and both supported reasoning delta spellings", () => {
    expect(
      extractResponsesStreamDelta({ type: "response.output_text.delta", delta: "答案" })
    ).toEqual({ content: "答案", reasoning: "" });
    expect(
      extractResponsesStreamDelta({ type: "response.reasoning_text.delta", delta: "分析" })
    ).toEqual({ content: "", reasoning: "分析" });
    expect(
      extractResponsesStreamDelta({
        type: "response.reasoning_summary_text.delta",
        delta: "摘要",
      })
    ).toEqual({ content: "", reasoning: "摘要" });
  });

  it("reads the actual routed model from response lifecycle events", () => {
    expect(responseModel({ response: { model: "Qwen3.5-35B-A3B" } })).toBe(
      "Qwen3.5-35B-A3B"
    );
  });
});
