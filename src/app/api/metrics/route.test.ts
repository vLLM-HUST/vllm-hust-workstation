// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const upstream = vi.hoisted(() => ({
  fetchUpstreamMetrics: vi.fn(), fetchUpstreamStats: vi.fn(),
  fetchUpstreamEngineProbe: vi.fn(), fetchUpstreamModels: vi.fn(),
}));
const metrics = vi.hoisted(() => ({
  getInternalMetricsSnapshot: vi.fn(), recordApiRequest: vi.fn(),
  recordUpstreamRequest: vi.fn(), setWorkstationInfo: vi.fn(),
}));
vi.mock("@/lib/upstream", () => upstream);
vi.mock("@/lib/metrics", () => metrics);
import { GET } from "./route";

const probe = { reachable: true, status: 200, durationSeconds: 0.01 };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DEFAULT_MODEL", "configured-old-model");
  metrics.getInternalMetricsSnapshot.mockReturnValue({ modelName: "old-internal-model", backendType: "Ascend NPU", totalRequestsServed: 2 });
  upstream.fetchUpstreamMetrics.mockResolvedValue({ ...probe, snapshot: { modelName: "old-prometheus-model", tokensPerSecond: 12 } });
  upstream.fetchUpstreamStats.mockResolvedValue({ ...probe, snapshot: { modelName: "zai-org/GLM-4-32B-0414", pendingRequests: 3 } });
  upstream.fetchUpstreamEngineProbe.mockResolvedValue({ ...probe, state: "unsupported", modelIds: [] });
  upstream.fetchUpstreamModels.mockResolvedValue({ ...probe, ids: ["Qwen/Qwen3.8-27B"] });
});
afterEach(() => vi.unstubAllEnvs());

describe("current model identity in metrics", () => {
  it("uses live model discovery instead of old internal, stats, metrics or configured labels", async () => {
    const response = await GET();
    const data = await response.json();
    expect(data.modelName).toBe("Qwen/Qwen3.8-27B");
    expect(data).toMatchObject({ tokensPerSecond: 12, pendingRequests: 3, totalRequestsServed: 2 });
    expect(metrics.setWorkstationInfo).toHaveBeenLastCalledWith("Qwen/Qwen3.8-27B", "Ascend NPU");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it("prefers healthy engine discovery consistently with the model selector", async () => {
    upstream.fetchUpstreamEngineProbe.mockResolvedValue({ ...probe, state: "healthy", modelIds: ["current-engine"] });
    expect((await (await GET()).json()).modelName).toBe("current-engine");
  });
  it("does not silently pick one model from a multi-model service", async () => {
    upstream.fetchUpstreamModels.mockResolvedValue({ ...probe, ids: ["a", "b", "a"] });
    expect((await (await GET()).json()).modelName).toBe("a · b");
  });
  it.each([false, true])("does not use old labels when model discovery is empty (reachable=%s)", async reachable => {
    upstream.fetchUpstreamModels.mockResolvedValue({ ...probe, reachable, ids: [] });
    expect((await (await GET()).json()).modelName).toBe("未核验");
  });
  it("does not label a model current when engine management says unhealthy", async () => {
    upstream.fetchUpstreamEngineProbe.mockResolvedValue({ ...probe, state: "unhealthy", modelIds: [] });
    expect((await (await GET()).json()).modelName).toBe("未核验");
  });
  it("clears the previous identity on a subsequent failed probe", async () => {
    expect((await (await GET()).json()).modelName).toBe("Qwen/Qwen3.8-27B");
    upstream.fetchUpstreamModels.mockResolvedValue({ ...probe, reachable: false, ids: [] });
    expect((await (await GET()).json()).modelName).toBe("未核验");
    expect(metrics.setWorkstationInfo).toHaveBeenLastCalledWith("未核验", "Ascend NPU");
  });
});
