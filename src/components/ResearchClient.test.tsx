import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import ResearchClient from "./ResearchClient";

afterEach(() => vi.unstubAllGlobals());
it("requires scoped credentials, keeps them out of storage and exposes raw request controls", async () => {
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({targets:[{id:"physical",model:"physical-model",engine_model:"actual-model",shared:true}]}),{status:200}));
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
    expect(host.textContent).toContain("不能把 HTTP TTFT 当作 GPU 内核耗时");
    expect(JSON.stringify(localStorage)).not.toContain("fixture-research-key");
    expect(JSON.stringify(sessionStorage)).not.toContain("fixture-research-key");
    expect(host.textContent).not.toContain("fixture-research-key");
    const logout=[...host.querySelectorAll("button")].find(button=>button.textContent==="退出研究权限")!;
    await act(async()=>logout.click());
    expect(host.querySelector('[aria-label="原始 prompt"]')).toBeNull();
    expect(host.querySelector<HTMLInputElement>('[aria-label="研究凭据"]')!.value).toBe("");
  } finally { await act(async()=>root.unmount()); host.remove(); }
});
