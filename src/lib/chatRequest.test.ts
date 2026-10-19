// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildResponsesRequest, resolveOutputBudget } from "./chatRequest";
import { readFileSync } from "node:fs";
afterEach(() => vi.unstubAllEnvs());

describe("generation budget and thinking wire contract", () => {
  it("keeps the shipped deployment template aligned with the server fallback", () => {
    const template = readFileSync(new URL('../../.env.example',import.meta.url),'utf8');
    const budget = template.match(/^WORKSTATION_DEFAULT_MAX_TOKENS=(\d+)$/m)![1];
    expect(resolveOutputBudget({},budget)).toBe(resolveOutputBudget({},undefined));
  });
  it("supplies 4096 to an ordinary default browser request", () => {
    vi.stubEnv("WORKSTATION_DEFAULT_MAX_TOKENS", "4096");
    expect(buildResponsesRequest({model:"A100",enable_thinking:true}, [])).toMatchObject({
      max_output_tokens:4096,chat_template_kwargs:{enable_thinking:true},stream:true,
    });
  });
  it("preserves explicit budgets and both thinking modes", () => {
    expect(buildResponsesRequest({max_tokens:128,enable_thinking:false,
      chat_template_kwargs:{extra_flag:true}},[])).toMatchObject({
      max_output_tokens:128,chat_template_kwargs:{enable_thinking:false,extra_flag:true},
    });
    expect(resolveOutputBudget({max_output_tokens:8192},"4096")).toBe(8192);
    expect(resolveOutputBudget({},"8192")).toBe(8192);
    expect(resolveOutputBudget({},undefined)).toBe(4096);
  });
  it.each([0,-1,1.5,"4096",NaN,Infinity])("rejects invalid explicit budget %s", value => {
    expect(() => resolveOutputBudget({max_tokens:value})).toThrow();
  });
  it.each(["", "NaN", "0", "-128", "1.5"])("rejects invalid configured budget %s", value => {
    expect(() => resolveOutputBudget({},value)).toThrow();
  });
  it("rejects conflicting aliases instead of silently overriding a request", () => {
    expect(() => resolveOutputBudget({max_tokens:128,max_output_tokens:4096})).toThrow();
  });
});
