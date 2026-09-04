import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import WorkstationClient from "./WorkstationClient";
import LocalServiceCard from "./LocalServiceCard";
import type { AppConfig } from "@/types";

const config: AppConfig = {
  brandName: "Fixture",
  brandLogo: null,
  accentColor: "#6366f1",
  baseUrl: "http://private.invalid",
  defaultModel: "zai-org/GLM-4-32B-0414",
  searchEnabled: false,
};

let host: HTMLDivElement;
let root: Root | undefined;
let resolveVersions: (value: unknown) => void;
let resolveModels: (value: unknown) => void;

function response(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })) });
  root = undefined;
  host = document.createElement("div");
  document.body.append(host);
  const versions = new Promise(resolve => { resolveVersions = resolve; });
  const models = new Promise(resolve => { resolveModels = resolve; });
  vi.stubGlobal("fetch", vi.fn((input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/api/versions")) return versions;
    if (url.includes("/api/models")) return models;
    if (url.includes("/api/hardware")) return Promise.resolve(response({}));
    if (url.includes("/api/metrics")) return new Promise(() => {});
    if (url.includes("/api/local-service")) return new Promise(() => {});
    return Promise.reject(new Error("unexpected request"));
  }));
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("SSR and pre-probe hydration show neither stale model nor an offline verdict", async () => {
  const html = renderToString(<WorkstationClient config={config} />);
  expect(html).toContain("正在核验推理服务");
  expect(html).not.toContain("GLM-4-32B");
  expect(html).not.toContain("推理服务暂时离线");
  host.innerHTML = html;
  await act(async () => { root = hydrateRoot(host, <WorkstationClient config={config} />); });
  expect(host.textContent).toContain("正在核验推理服务");
  expect(host.textContent).not.toContain("GLM-4-32B");
  expect(host.textContent).not.toContain("推理服务暂时离线");

  await act(async () => {
    resolveModels(response({ data: [{ id: "Qwen3.8-27B" }], upstreamAvailable: true, engineReady: true, liveModelSwitchSupported: false }));
  });
  expect(host.textContent).not.toContain("Qwen3.8-27B");
  await act(async () => {
    resolveVersions(response({ available: false, source: "unavailable", vllmHust: "unavailable", vllmAscendHust: "unavailable" }));
  });
  expect(host.textContent).toContain("Qwen3.8-27B");
  expect(host.textContent).toContain("推理工作区已就绪");
});

it("service controls are absent from server HTML before status and authorization", () => {
  const html = renderToString(<LocalServiceCard />);
  expect(html).toContain("正在探测推理服务");
  for (const label of ["一键拉起", "重启本地后端", "停止本地演示栈", "管理员重启推理后端"]) {
    expect(html).not.toContain(label);
  }
});
