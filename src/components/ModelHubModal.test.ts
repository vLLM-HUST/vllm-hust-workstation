import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ModelHubModal from "./ModelHubModal";
import type { ModelHubCatalog } from "@/types";
let root: Root;
let host: HTMLDivElement;
let downloading: boolean;
let failAction: boolean;
let freeBytes: number;
const fetchMock = vi.fn();
function fixture(admin: boolean): ModelHubCatalog {
  return {
    catalog: [{ id: "fixture", name: "Fixture model", repoId: "test/fixture", params: "7B", sizeGb: 15, vramGb: 10, description: "Fixture", tags: [], color: "#000", installed: false, download: {status: downloading ? "downloading" : "idle", pct: 0} }],
    permissions: { administrator: admin, canDownload: admin, canActivate: false },
    storage: { configured: true, available: true, message: "Storage ready", ...(admin ? {path: "/private/test/models", freeBytes} : {}) },
  };
}
async function render(open = true) {
  await act(async () => { root.render(createElement(ModelHubModal, { open, currentModel: "running", onClose: vi.fn() })); });
}
function button(text: string) {
  const result = [...host.querySelectorAll("button")].find(node => node.textContent?.trim() === text);
  if (!result) throw new Error(`Missing button: ${text}`);
  return result;
}
async function login(token = "fixture-token") {
  await act(async () => button("管理员登录").click());
  const input = host.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, token);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
  downloading = false; failAction = false; freeBytes = 500e9;
  fetchMock.mockReset().mockImplementation(async (_url: string, options?: RequestInit) => {
    const token = (options?.headers as Record<string, string>)?.["X-Workstation-Admin-Token"];
    if (options?.method) {
      if (failAction) throw new Error("模拟网络中断");
      downloading = options.method === "POST";
      return { ok: true, status: 200, json: async () => ({ok: true, message: "已提交下载"}) };
    }
    if (token && token !== "fixture-token") return {ok: false, status: 401};
    return {ok: true, status: 200, json: async () => fixture(Boolean(token))};
  });
  vi.stubGlobal("fetch", fetchMock);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("public users only browse and never see private storage or fake activation", async () => {
  await render();
  expect(host.textContent).toContain("只读浏览");
  expect(host.textContent).not.toContain("/private/");
  expect(host.textContent).not.toContain("设为当前");
  expect([...host.querySelectorAll("button")].some(node => node.textContent === "下载权重")).toBe(false);
  await act(async () => button("刷新列表").click());
  expect(fetchMock.mock.calls.every(([, options]) => !options?.method)).toBe(true);
});
it("rejects invalid login, keeps token masked and clears it on close", async () => {
  await render(); await login("wrong");
  expect(host.textContent).toContain("管理员令牌无效");
  expect(host.querySelector("input")?.type).toBe("password");
  expect(host.textContent).not.toContain("/private/");
  await render(false); await render(); await login();
  expect(host.textContent).toContain("/private/test/models");
  expect(host.querySelector("input")).toBeNull();
  await render(false); await render();
  expect(host.textContent).not.toContain("/private/");
  expect(host.textContent).toContain("只读浏览");
  expect(window.localStorage.getItem("fixture-token")).toBeNull();
});
it("admin download and cancel buttons send authenticated requests and refresh progress", async () => {
  await render(); await login();
  await act(async () => button("下载权重").click());
  expect(host.textContent).toContain("下载中");
  await act(async () => button("取消").click());
  const mutations = fetchMock.mock.calls.filter(([, options]) => options?.method);
  expect(mutations.map(([, options]) => options.method)).toEqual(["POST", "DELETE"]);
  expect(mutations.every(([, options]) => options.headers["X-Workstation-Admin-Token"] === "fixture-token")).toBe(true);
});
it("shows action network failures without an unhandled rejection", async () => {
  await render(); await login(); failAction = true;
  await act(async () => button("下载权重").click());
  expect(host.textContent).toContain("模拟网络中断");
  expect(button("下载权重").disabled).toBe(false);
});
it("disables downloads when there is insufficient storage", async () => {
  freeBytes = 1e9; await render(); await login();
  expect(button("空间不足").disabled).toBe(true);
});
