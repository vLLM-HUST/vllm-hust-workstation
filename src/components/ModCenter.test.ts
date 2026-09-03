import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ModCenter from "./ModCenter";
import { MOD_CATALOG } from "@/lib/modCatalog";

let root: Root;
let host: HTMLDivElement;
const fetchMock = vi.fn();

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200, json: async () => ({
    catalog: MOD_CATALOG.map(mod => ({ ...mod, state: { installed: false, configured: false, enabled: false } })),
    administrator: false, storageReady: true, tasks: [], runtime: { status: "unverified" },
  }) });
  vi.stubGlobal("fetch", fetchMock);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals();
});

it("separates historical source declarations from pending target qualification", async () => {
  await act(async () => root.render(createElement(ModCenter)));
  const cards = [...host.querySelectorAll("article")];
  expect(cards).toHaveLength(4);
  for (const card of cards.slice(0, 3)) {
    const details = card.querySelector("details")!;
    expect(details.open).toBe(false);
    expect(details.querySelector("summary")?.textContent).toBe("适配说明 · 当前实例待验收");
    expect(details.textContent).toContain("历史声明基线");
    expect(details.textContent).toContain("旧基线不代表当前实例不兼容");
    expect(details.querySelector("dd")?.textContent).toBe(MOD_CATALOG[cards.indexOf(card)].compatibility);
    expect(card.textContent).toContain("运行未核验");
  }
  expect(cards[3].querySelector("details")).toBeNull();
  expect(cards[3].textContent).toContain("由外部服务运维方管理");
});

it("does not turn historical-range presentation into activation or public mutation authority", async () => {
  await act(async () => root.render(createElement(ModCenter)));
  expect(host.textContent).not.toContain("官方 vLLM 暂不支持");
  expect(host.textContent).not.toContain("已兼容");
  expect([...host.querySelectorAll("button")].some(button => /安装到|启用意图|卸载/.test(button.textContent || ""))).toBe(false);
  expect(fetchMock.mock.calls).toHaveLength(1);
  expect(fetchMock.mock.calls[0][1].method).toBeUndefined();
});
