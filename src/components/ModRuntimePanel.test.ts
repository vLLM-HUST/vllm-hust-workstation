import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ModRuntimePanel from "./ModRuntimePanel";
import type { ModRuntimePayload } from "@/lib/modRuntimeTypes";

let host: HTMLDivElement;
let root: Root;
let payload: ModRuntimePayload;
let fail = false;
const fetchMock = vi.fn();
const expired = vi.fn();
const changed = vi.fn();
function button(label: string) {
  const node = [...host.querySelectorAll("button")].find(item => item.textContent === label);
  if (!node) throw new Error("missing button " + label);
  return node;
}
async function render(token = "") {
  await act(async () => root.render(createElement(ModRuntimePanel, { token, onAuthorizationExpired: expired, onLibraryChanged: changed })));
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  fail = false; expired.mockReset(); changed.mockReset();
  payload = { administrator: false, target: { id: "current", label: "工作站实例", ownership: "shared", identityVerified: true, models: ["model"], observedMods: null, imageId: "sha256:" + "a".repeat(64) }, preparationAvailable: true, applicationAvailable: false, message: "应用前需完成验收", tasks: [] };
  fetchMock.mockReset().mockImplementation(async (_url: string, options: RequestInit) => {
    if (fail) return { ok: false, status: 503, json: async () => ({ error: "实例暂不可用" }) };
    if (options.method === "POST") {
      payload.tasks = [{ id: "fixture", targetId: "current", modId: "diffspec", status: "prepared", baseImageId: "sha256:" + "a".repeat(64), imageId: "sha256:" + "b".repeat(64), createdAt: "2026-09-03T00:00:00Z", updatedAt: "2026-09-03T00:00:01Z", logs: ["fixture only"] }];
      return { ok: true, status: 202, json: async () => ({ id: "fixture" }) };
    }
    const token = (options.headers as Record<string, string>)["X-Workstation-Admin-Token"];
    return { ok: true, status: 200, json: async () => ({ ...payload, administrator: Boolean(token) }) };
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it("shows public target identity without mutation controls or a false effective Mod", async () => {
  await render();
  expect(host.textContent).toContain("工作站实例");
  expect(host.textContent).toContain("生效 Mod：待核验");
  expect(host.textContent).not.toContain("准备运行镜像");
  expect(host.querySelector("select")).toBeNull();
});

it("requires confirmation and sends only target/Mod/action IDs with administrator authentication", async () => {
  await render("fixture-token");
  await act(async () => button("准备运行镜像").click());
  expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  expect(fetchMock.mock.calls.filter(([, options]) => options.method)).toHaveLength(0);
  await act(async () => button("确认准备").click());
  const [, request] = fetchMock.mock.calls.find(([, options]) => options.method === "POST")!;
  expect(JSON.parse(request.body)).toEqual({ action: "prepare", targetId: "current", modId: "diffspec" });
  expect(request.headers["X-Workstation-Admin-Token"]).toBe("fixture-token");
  expect(host.textContent).toContain("已准备 · 未应用");
  expect(host.textContent).toContain("生效 Mod：待核验");
  expect(button("应用到实例").disabled).toBe(true);
  expect(changed).toHaveBeenCalledTimes(1);
});

it("clears stale target and controls on read failure and clears admin state on logout", async () => {
  await render("fixture-token"); fail = true;
  await act(async () => button("刷新实例").click());
  expect(host.textContent).toContain("实例暂不可用");
  expect(host.textContent).not.toContain("准备运行镜像");
  expect(host.textContent).not.toContain("容器身份已核验");
  fail = false; await render("");
  expect(host.querySelector("select")).toBeNull();
});
