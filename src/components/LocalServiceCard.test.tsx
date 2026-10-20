import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import LocalServiceCard from "./LocalServiceCard";

it("preserves complete long paths and model IDs with wrapping, not clipping", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const path = "/release/" + "a".repeat(160) + "/.logs/engine.log";
  const model = "Qwen/" + "long-model-".repeat(16);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    isLocalTarget: true, inferenceReady: true, currentModel: model,
    desiredModel: model, backendLogFile: path, baseUrl: "http://localhost:18003",
  }))));
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<LocalServiceCard />));
    const log = [...host.querySelectorAll("p")].find(p => p.textContent?.startsWith("后端日志:"))!;
    expect(log.textContent).toContain(path);
    expect(log.className).toContain("[overflow-wrap:anywhere]");
    const card = log.closest(".app-card")!;
    expect(card.className).toContain("min-w-0");
    expect(card.className).toContain("max-w-full");
    expect(host.textContent).toContain(model);
    expect(host.querySelector(".truncate")).toBeNull();
  } finally {
    await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals();
  }
});
