import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import HardwareDetails from "./HardwareDetails";
import ChatPanel from "./ChatPanel";

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
