// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const request = (body: unknown) => new NextRequest("https://ws.invalid/api/advisory", {method:"POST",body:JSON.stringify(body)});
it("never passes model secrets or reasoning, and gives an independent unavailable result", async () => {
  const fetch = vi.fn().mockRejectedValue(new Error("private endpoint details")); vi.stubGlobal("fetch",fetch);
  const response = await POST(request({question:"问题",answer:"原始答案"}));
  expect(response.status).toBe(503);
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({question:"问题",answer:"原始答案"});
  expect(fetch.mock.calls[0][1].headers).toEqual({"Content-Type":"application/json"});
  expect(await response.text()).not.toContain("private endpoint");
});
it("rejects caller-supplied endpoints and unknown fields before network access", async () => {
  const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
  expect((await POST(request({question:"q",answer:"a",url:"http://example.org"}))).status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
  vi.stubEnv("WORKSTATION_SAGE_ADVISORY_URL","http://example.org/audit");
  expect((await POST(request({question:"q",answer:"a"}))).status).toBe(503);
  expect(fetch).not.toHaveBeenCalled();
});
it("rejects oversized advisory inputs without forwarding a truncated answer",async()=>{
  const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
  expect((await POST(request({question:"q",answer:"x".repeat(2_000_001)}))).status).toBe(413);
  expect(fetch).not.toHaveBeenCalled();
});
