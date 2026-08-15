import { describe, expect, it } from "vitest";
import {
  parseModelCapabilities,
  selectModelCapability,
} from "./server/evoscientist/capabilities";

describe("EvoScientist model capabilities", () => {
  it("reads vLLM context capability without relying on a model-name table", () => {
    expect(parseModelCapabilities({
      data: [{ id: "org/research-model", max_model_len: 32768 }],
    })).toEqual([{ id: "org/research-model", maxContextTokens: 32768 }]);
  });

  it("rejects invalid context metadata", () => {
    expect(parseModelCapabilities({
      data: [{ id: "model", max_model_len: 0 }],
    })).toEqual([{ id: "model", maxContextTokens: null }]);
  });

  it("matches served and requested model aliases", () => {
    const selected = selectModelCapability(
      ["research-model"],
      [{ id: "org/research-model", maxContextTokens: 16384 }]
    );
    expect(selected?.id).toBe("org/research-model");
  });
});
