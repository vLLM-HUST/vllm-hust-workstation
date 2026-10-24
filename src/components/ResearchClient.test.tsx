import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import ResearchClient, { TimingSummary } from "./ResearchClient";

it("shows native clocks separately and never substitutes transport timing", async () => {
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  const host=document.createElement("div"); const root=createRoot(host);
  try {
    await act(async()=>root.render(<TimingSummary receipt={{total_ms: 1000, browser_total_ms: 2000, browser_receipt_fetch_ms: 300,
      native_timing: {status:"available", inference_ms:6, queue_ms:1, scheduled_to_first_token_ms:2, decode_ms:4}}} />));
    expect(host.textContent).toContain("6.0 ms");
    expect(host.textContent).toContain("1000.0 ms");
    expect(host.textContent).toContain("2000.0 ms");
    expect(host.textContent).toContain("300.0 ms");
    expect(host.textContent).toContain("不是纯 GPU");
    for (const native of [undefined, {status:"invalid"}, {status:"incomplete_sample", inference_ms:999}]) {
      await act(async()=>root.render(<TimingSummary receipt={{total_ms:1000, native_timing:native}} />));
      expect(host.textContent).toContain("不可用（非成功计时样本）");
      expect(host.textContent).not.toContain("999.0 ms");
    }
  } finally { await act(async()=>root.unmount()); }
});

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("requires scoped credentials, keeps them out of storage and exposes raw request controls", async () => {
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({targets:[{id:"physical",model:"physical-model",engine_model:"actual-model",shared:true}, {id:"other",model:"other-model",engine_model:"actual-model",shared:true}]}),{status:200}));
  vi.stubGlobal("fetch",fetch);
  const host=document.createElement("div"); document.body.append(host);
  const root=createRoot(host);
  const set = (input: HTMLInputElement, value: string) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,value);
    input.dispatchEvent(new Event("input",{bubbles:true}));
  };
  try {
    await act(async()=>root.render(<ResearchClient />));
    expect(fetch).not.toHaveBeenCalled();
    expect(host.textContent).toContain("不添加 chat template");
    const input=host.querySelector<HTMLInputElement>('[aria-label="研究凭据"]')!;
    await act(async()=>set(input,"fixture-research-key"));
    await act(async()=>host.querySelector<HTMLButtonElement>("button")!.click());
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer fixture-research-key");
    expect(host.querySelector('[aria-label="原始 prompt"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="原始输入格式"]')).not.toBeNull();
    const stops=host.querySelector<HTMLInputElement>('[aria-label="停止序列"]')!;
    expect(stops.value).toBe("[]");
    await act(async()=>set(stops,'["END","\\n"]'));
    expect(host.textContent).toContain('"stop": [');
    expect(host.textContent).toContain('"END"');
    await act(async()=>set(stops,'[null]'));
    expect(host.textContent).toContain('不是有效 JSON 参数');
    await act(async()=>set(stops,'["END"]'));
    const prompt=host.querySelector<HTMLTextAreaElement>('[aria-label="原始 prompt"]')!;
    await act(async()=>{
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(prompt,"raw fixture");
      prompt.dispatchEvent(new Event("input",{bubbles:true}));
    });
    let clock=0;
    vi.spyOn(performance,"now").mockImplementation(()=>clock);
    fetch.mockImplementationOnce(async()=>{
      clock=100;
      return new Response('data: {"choices":[{"text":"ok","finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
        {headers:{"x-research-trace-id":"fixture-trace"}});
    });
    fetch.mockImplementationOnce(async()=>{ clock=900; return new Response(JSON.stringify({state:"completed"})); });
    await act(async()=>[...host.querySelectorAll("button")].find(button=>button.textContent==="发送原始 prompt")!.click());
    const sent=JSON.parse(fetch.mock.calls[1][1].body);
    expect(sent.prompt).toBe("raw fixture");
    expect(sent.stop).toEqual(["END"]);
    expect(sent.messages).toBeUndefined();
    expect(host.textContent).toContain("原始流正常结束");
    expect(host.textContent).toContain('"browser_total_ms": 100');
    expect(host.textContent).toContain('"browser_receipt_fetch_ms": 800');
    expect(host.textContent).toContain("不能把 HTTP TTFT 当作 GPU 内核耗时");
    expect(host.textContent).toContain("公网访问时还包含 Cloudflare");
    expect(JSON.stringify(localStorage)).not.toContain("fixture-research-key");
    expect(JSON.stringify(sessionStorage)).not.toContain("fixture-research-key");
    expect(host.textContent).not.toContain("fixture-research-key");
    const selector=host.querySelector<HTMLSelectElement>('[aria-label="固定研究后端"]')!;
    await act(async()=>{ selector.value="other-model"; selector.dispatchEvent(new Event("change",{bubbles:true})); });
    expect(host.querySelector('[aria-label="分层计时"]')).toBeNull();
    expect(host.textContent).not.toContain('"browser_total_ms": 100');
    expect(host.textContent).toContain("未沿用上一后端计时");
    const logout=[...host.querySelectorAll("button")].find(button=>button.textContent==="退出研究权限")!;
    await act(async()=>logout.click());
    expect(host.querySelector('[aria-label="原始 prompt"]')).toBeNull();
    expect(host.querySelector<HTMLInputElement>('[aria-label="研究凭据"]')!.value).toBe("");
  } finally { await act(async()=>root.unmount()); host.remove(); }
});
