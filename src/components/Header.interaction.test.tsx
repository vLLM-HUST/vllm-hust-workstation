import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import Header from "./Header";

it("keeps primary controls reachable and dismisses secondary tools on Escape/outside/selection", async () => {
  Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT:true});
  const host=document.createElement("div"); document.body.append(host);
  const root=createRoot(host), hub=vi.fn(), metrics=vi.fn(), inference=vi.fn();
  try {
    await act(async()=>root.render(<Header brandName="WS" brandLogo={null} accentColor="#0f766e" model="model-a" models={["model-a"]}
      liveModelSwitchSupported onModelChange={()=>{}} onOpenModelHub={hub} onOpenAgentLab={()=>{}} onOpenMetrics={metrics}
      onOpenInference={inference} theme="dark" onToggleTheme={()=>{}} serviceStatus="online" />));
    const tools=host.querySelector("details")!, summary=tools.querySelector("summary")!;
    await act(async()=>summary.click()); expect(tools.open).toBe(true);
    await act(async()=>tools.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true})));
    expect(tools.open).toBe(false); expect(document.activeElement).toBe(summary);
    await act(async()=>summary.click());
    await act(async()=>document.body.dispatchEvent(new Event("pointerdown",{bubbles:true})));
    expect(tools.open).toBe(false);
    await act(async()=>summary.click());
    await act(async()=>tools.querySelector<HTMLButtonElement>("button")!.click());
    expect(hub).toHaveBeenCalledOnce(); expect(tools.open).toBe(false);
    await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="打开运行状态"]')!.click());
    await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="查看推理过程"]')!.click());
    expect(metrics).toHaveBeenCalledOnce(); expect(inference).toHaveBeenCalledOnce();
    expect(host.querySelector("select")).not.toBeNull();
  } finally { await act(async()=>root.unmount()); host.remove(); }
});
