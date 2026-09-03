// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const store = vi.hoisted(() => ({
  startDownload: vi.fn(async () => ({ ok: true, status: 202, message: "submitted" })),
  cancelDownload: vi.fn(() => true),
  getCatalog: vi.fn(async (administrator: boolean) => ({ permissions: { administrator } })),
}));
vi.mock("@/lib/modelHubStore", () => store);
import { POST as download, DELETE as cancel } from "@/app/api/hub/download/[modelId]/route";
import { POST as activate } from "@/app/api/hub/activate/[modelId]/route";
import { GET as catalog } from "@/app/api/hub/catalog/route";
const context = { params: Promise.resolve({ modelId: "Qwen3-32B" }) };
const request = (token = "", method = "POST") => new Request("http://test.local/api/hub", {
  method, headers: token ? { "X-Workstation-Admin-Token": token } : {},
});
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("WORKSTATION_ADMIN_TOKEN", "fixture-admin"); });
afterEach(() => vi.unstubAllEnvs());
describe("model hub authorization boundary", () => {
  it.each(["", "invalid", "fixture-admiX"])("rejects unauthorized mutations (%s) before reaching store", async token => {
    expect((await download(request(token), context)).status).toBe(401);
    expect((await cancel(request(token, "DELETE"), context)).status).toBe(401);
    expect((await activate(request(token))).status).toBe(401);
    expect(store.startDownload).not.toHaveBeenCalled();
    expect(store.cancelDownload).not.toHaveBeenCalled();
  });
  it("fails closed when administrator credentials are not configured", async () => {
    vi.stubEnv("WORKSTATION_ADMIN_TOKEN", "");
    expect((await download(request("fixture-admin"), context)).status).toBe(401);
  });
  it("allows authenticated downloads and cancellations", async () => {
    expect((await download(request("fixture-admin"), context)).status).toBe(202);
    expect((await cancel(request("fixture-admin", "DELETE"), context)).status).toBe(200);
    expect(store.startDownload).toHaveBeenCalledWith("Qwen3-32B");
    expect(store.cancelDownload).toHaveBeenCalledWith("Qwen3-32B");
  });
  it("disables fake activation even for an administrator", async () => {
    vi.stubEnv("DEFAULT_MODEL", "running-model");
    expect((await activate(request("fixture-admin"))).status).toBe(409);
    expect(process.env.DEFAULT_MODEL).toBe("running-model");
  });
  it("distinguishes public/admin catalog and forbids cached credentialed responses", async () => {
    const publicResponse = await catalog(request("", "GET"));
    expect(store.getCatalog).toHaveBeenLastCalledWith(false);
    expect(publicResponse.headers.get("Cache-Control")).toBe("no-store");
    const adminResponse = await catalog(request("fixture-admin", "GET"));
    expect(store.getCatalog).toHaveBeenLastCalledWith(true);
    expect(adminResponse.headers.get("Vary")).toBe("X-Workstation-Admin-Token");
    store.getCatalog.mockClear();
    expect((await catalog(request("wrong", "GET"))).status).toBe(401);
    expect(store.getCatalog).not.toHaveBeenCalled();
  });
});
