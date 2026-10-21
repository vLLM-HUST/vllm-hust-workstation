// @vitest-environment node
import { webcrypto, createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { requestAnswerAdvisory, validateAdvisoryReport } from "./answerAdvisory";

const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const answer = "🙂 中文公式 $$M=B*L$$";
function report() { return { version:1, mode:"advisory", status:"issues", answer_sha256:digest(answer),
  question_sha256:digest("问题"), checked_formulas:1, scope:"仅变量依赖", limitations:["不证明正确性"],
  findings:[{code:"missing_dependency",title:"待核对",quote:"$$M=B*L$$",details:"来源条件下缺少项",source_ids:["source"]}],
  sources:[{id:"source",title:"依据",url:"https://example.org/source",excerpt:"完整依据",assumptions:"适用条件"}] }; }
afterEach(() => vi.unstubAllGlobals());
it("binds Unicode raw answer and question without sending thoughts or model parameters", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const fetch = vi.fn().mockResolvedValue(Response.json(report())); vi.stubGlobal("fetch", fetch);
  expect(await requestAnswerAdvisory("问题", answer)).toMatchObject({status:"ready"});
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({question:"问题",answer});
});
it.each(["network", "http", "stale", "quote"])("isolates %s failures without returning an edited answer", async (kind) => {
  vi.stubGlobal("crypto", webcrypto);
  const value = report();
  if(kind === "stale") value.answer_sha256 = "0".repeat(64);
  if(kind === "quote") value.findings[0].quote = "不在原文里";
  vi.stubGlobal("fetch",kind === "network" ? vi.fn().mockRejectedValue(new Error("private upstream failure"))
    : vi.fn().mockResolvedValue(Response.json(value,{status:kind === "http" ? 503 : 200})));
  const result = await requestAnswerAdvisory("问题",answer);
  expect(result).toMatchObject({status:"unavailable"});
  expect(JSON.stringify(result)).not.toContain("private upstream failure");
  expect(result).not.toHaveProperty("answer");
});
it("rejects invented sources and false clean states", () => {
  const value = report(); value.findings[0].source_ids = ["invented"];
  expect(() => validateAdvisoryReport(value, answer)).toThrow();
  expect(() => validateAdvisoryReport({...report(),status:"no_dependency_gap"},answer)).toThrow();
});
