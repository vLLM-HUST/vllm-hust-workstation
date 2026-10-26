import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import HardwareDetails from "./HardwareDetails";
import ChatPanel from "./ChatPanel";
import MetricsDashboard from "./MetricsDashboard";
import type { MetricsSnapshot } from "@/types";

it("does not render hardware on SSR or initial mount; explicit toggle only, Escape and remount close it", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const view = (value: string) => <HardwareDetails><span>{value}</span></HardwareDetails>;
  expect(renderToStaticMarkup(view("GPU-secret-fixture"))).not.toContain("GPU-secret-fixture");
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(view("GPU-first")));
    expect(host.textContent).toBe("硬件信息");
    await act(async () => root.render(view("GPU-new-telemetry")));
    expect(host.textContent).not.toContain("GPU-new-telemetry");
    const details = host.querySelector("details")!;
    await act(async () => { details.open = true; details.dispatchEvent(new Event("toggle")); });
    expect(host.textContent).toContain("GPU-new-telemetry");
    await act(async () => details.dispatchEvent(new KeyboardEvent("keydown", {key:"Escape", bubbles:true})));
    expect(details.open).toBe(false); expect(host.textContent).not.toContain("GPU-new-telemetry");
    expect(document.activeElement).toBe(details.querySelector("summary"));
    await act(async () => root.render(<HardwareDetails key="new-view">GPU-reset</HardwareDetails>));
    expect(host.textContent).not.toContain("GPU-reset");
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it("welcome leaves the actual model readable without exposing CPU, device or RAM", () => {
  const html = renderToStaticMarkup(<ChatPanel messages={[]} loading={false} accentColor="#6366f1"
    webSearch={false} searchEnabled={true} thinkingEnabled={true} onSend={()=>{}} onStop={()=>{}}
    onClear={()=>{}} onToggleWebSearch={()=>{}} onToggleThinking={()=>{}} onOpenInference={()=>{}}
    onOpenMetrics={()=>{}} onAuditMessage={()=>{}} serviceStatus="online" model="public-model"
    hardware={{npu:"GPU-private",cpu:"CPU-private",memory:"RAM-private"}} />);
  expect(html).toContain("public-model"); expect(html).toContain("硬件信息");
  for (const value of ["GPU-private","CPU-private","RAM-private"]) expect(html).not.toContain(value);
});

it("monitor hides device memory, backend descriptor and hardware-bearing card labels even when opened", () => {
  const window = {requests:12,successes:12,errors:0,rateLimited:0,p50LatencyMs:10,p95LatencyMs:20};
  const windows = {"1m":window,"5m":window,"1h":window,"24h":window};
  const snapshot: MetricsSnapshot = {tokensPerSecond:7,pendingRequests:0,gpuUtilPct:17,
    gpuMemUsedGb:13.5,gpuMemTotalGb:80,uptimeSeconds:3600,totalRequestsServed:12,
    avgLatencyMs:20,modelName:"public-model",backendType:"private-backend-device",
    traffic:{generatedAt:1,retentionDays:1,activeRequests:0,activeKeys:1,configuredConcurrency:1,
      engineMaxSequences:1,totalRequests:12,totalSuccesses:12,windows,series:[],workloads:[],
      models:[{id:"public-model",backendId:"private-backend",displayName:"private-device-label",
        hardware:"private-hardware",activeRequests:0,activeKeys:0,totalRequests:12,totalSuccesses:12,
        lastRequestAt:null,lastSuccessAt:null,windows,series:[]}]}};
  const html = renderToStaticMarkup(<MetricsDashboard snapshot={snapshot} history={[]} accentColor="#6366f1"
    model="public-model" models={["public-model"]} liveModelSwitchSupported={false} serviceStatus="online"
    onModelChange={()=>{}} open onClose={()=>{}} runtimeProvenance={{available:false,source:"unavailable",vllmHust:"unavailable",vllmAscendHust:"unavailable"}} />);
  for (const value of ["private-backend-device","private-device-label","private-hardware","显存占用"]) expect(html).not.toContain(value);
  expect(html).toContain("后端硬件"); expect(html).toContain("模型后端 1");
  expect(html).toContain("推理请求 · 24 小时");
});
