import { afterEach, describe, expect, it, vi } from "vitest";
import { researchProxy } from "./researchProxy";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const token = "fixture-research-token";
function req(body = '{"prompt":[1,2,3],"model":"physical","max_tokens":16,"stream":true}') {
  return new Request("https://ws.example/v1/completions", { method:"POST", body,
    headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"} });
}

describe("isolated research relay", () => {
  it("rejects absent credentials without using public chat server key", async () => {
    vi.stubEnv("VLLM_HUST_API_KEY","never-send-this-server-key");
    const fetch = vi.fn(); vi.stubGlobal("fetch",fetch);
    const response = await researchProxy(new Request("https://ws.example/api/research/targets"),"targets");
    expect(response.status).toBe(401); expect(fetch).not.toHaveBeenCalled();
  });
  it("preserves the original payload, original stream and scoped credential", async () => {
    const raw = 'data: {"choices":[{"text":"<think>原始","finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';
    const fetch = vi.fn().mockResolvedValue(new Response(raw,{headers:{"Content-Type":"text/event-stream",
      "X-Research-Trace-ID":"a".repeat(32),"Server-Timing":"engine_headers;dur=12"}}));
    vi.stubGlobal("fetch",fetch);
    const original = req(); const body = await original.clone().text();
    const response = await researchProxy(original,"completions");
    const [url,init] = fetch.mock.calls[0];
    expect(String(url)).toBe("http://127.0.0.1:18013/v1/completions");
    expect(Buffer.from(init.body).toString()).toBe(body);
    expect(init.headers.Authorization).toBe(`Bearer ${token}`);
    expect(init.redirect).toBe("error");
    expect(await response.text()).toBe(raw);
    expect(response.headers.get("server-timing")).toContain("engine_headers;dur=12");
  });
  it("cannot turn paths, queries or env misconfiguration into SSRF/control", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch",fetch);
    expect((await researchProxy(req(),"../metrics")).status).toBe(404);
    expect((await researchProxy(req(),"restart")).status).toBe(404);
    const query=new Request("https://ws.example/api/research/metrics?model=x&url=http://evil",{headers:{Authorization:`Bearer ${token}`}});
    expect((await researchProxy(query,"metrics")).status).toBe(400);
    vi.stubEnv("WORKSTATION_RESEARCH_URL","https://external.example/");
    expect((await researchProxy(req(),"completions")).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("bounds request bytes before contacting the research service", async () => {
    const fetch=vi.fn(); vi.stubGlobal("fetch",fetch);
    expect((await researchProxy(req("x".repeat(1024*1024+1)),"completions")).status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("never retries a failed engine path via chat or another model", async () => {
    const fetch=vi.fn().mockRejectedValue(new Error("network")); vi.stubGlobal("fetch",fetch);
    expect((await researchProxy(req(),"completions")).status).toBe(502);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
