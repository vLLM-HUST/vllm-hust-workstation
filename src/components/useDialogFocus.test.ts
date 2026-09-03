import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDialogFocus } from "./useDialogFocus";

function Dialog({ active, close }: { active: boolean; close: () => void }) {
  const ref = useDialogFocus(active, close);
  return createElement("div", { ref, tabIndex: -1 },
    createElement("button", { id: "first" }, "First"),
    createElement("button", { disabled: true }, "Disabled"),
    createElement("button", { id: "last" }, "Last"));
}

describe("dialog keyboard contract", () => {
  let root: Root;
  let host: HTMLDivElement;
  let trigger: HTMLButtonElement;
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
    trigger = document.createElement("button");
    host = document.createElement("div");
    document.body.append(trigger, host);
    trigger.focus();
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove(); trigger.remove(); vi.restoreAllMocks();
  });
  it("focuses the first enabled control and restores the opener", () => {
    act(() => root.render(createElement(Dialog, { active: true, close: vi.fn() })));
    expect(document.activeElement?.id).toBe("first");
    act(() => root.render(createElement(Dialog, { active: false, close: vi.fn() })));
    expect(document.activeElement).toBe(trigger);
  });
  it("wraps Tab in both directions and handles Escape", () => {
    const close = vi.fn();
    act(() => root.render(createElement(Dialog, { active: true, close })));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, cancelable: true }));
    expect(document.activeElement?.id).toBe("last");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", cancelable: true }));
    expect(document.activeElement?.id).toBe("first");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(close).toHaveBeenCalledOnce();
  });
  it("does not steal focus in an inactive panel", () => {
    act(() => root.render(createElement(Dialog, { active: false, close: vi.fn() })));
    expect(document.activeElement).toBe(trigger);
  });
});
