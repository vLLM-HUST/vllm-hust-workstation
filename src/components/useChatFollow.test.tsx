import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useChatFollow } from "./useChatFollow";

it("preserves history during deltas and resize, resumes only at end or explicit latest", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let resize!: () => void;
  let disconnected = false;
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resize = callback; }
    observe() {} disconnect() { disconnected = true; }
  });
  function Fixture({version, empty = false}: {version: number; empty?: boolean}) {
    const follow = useChatFollow(version, empty);
    return <><div ref={follow.viewport} onScroll={follow.onScroll} data-viewport><div ref={follow.content}>history</div></div>
      {follow.away && <button onClick={follow.latest}>{follow.unread ? "new" : "latest"}</button>}</>;
  }
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Fixture version={1} />));
    const viewport = host.querySelector<HTMLDivElement>("[data-viewport]")!;
    Object.defineProperties(viewport, {scrollHeight: {configurable:true,value:1000}, clientHeight: {value:200}});
    viewport.scrollTop = 300;
    await act(async () => viewport.dispatchEvent(new Event("scroll", {bubbles:true})));
    expect(host.querySelector("button")?.textContent).toBe("latest");
    await act(async () => root.render(<Fixture version={2} />));
    expect(viewport.scrollTop).toBe(300);
    expect(host.querySelector("button")?.textContent).toBe("new");
    await act(async () => resize());
    expect(viewport.scrollTop).toBe(300);
    await act(async () => host.querySelector<HTMLButtonElement>("button")!.click());
    expect(viewport.scrollTop).toBe(1000); expect(host.querySelector("button")).toBeNull();
    Object.defineProperty(viewport,"scrollHeight",{configurable:true,value:1200});
    await act(async () => resize()); expect(viewport.scrollTop).toBe(1200);
    viewport.scrollTop=500;
    await act(async () => viewport.dispatchEvent(new Event("scroll", {bubbles:true})));
    await act(async () => root.render(<Fixture version={3} empty />));
    expect(host.querySelector("button")).toBeNull();
  } finally {
    await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals();
  }
  expect(disconnected).toBe(true);
});
