// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const upstream = vi.hoisted(() => ({
  fetchUpstreamEngineProbe: vi.fn(),
  fetchUpstreamModels: vi.fn(),
}));
const metrics = vi.hoisted(() => ({
  recordApiRequest: vi.fn(),
  recordUpstreamRequest: vi.fn(),
}));

vi.mock("@/lib/upstream", () => upstream);
vi.mock("@/lib/metrics", () => metrics);

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  upstream.fetchUpstreamModels.mockResolvedValue({
    reachable: true,
    status: 200,
    durationSeconds: 0.01,
    ids: ["model-a", "model-b"],
  });
  upstream.fetchUpstreamEngineProbe.mockResolvedValue({
    reachable: true,
    status: 200,
    durationSeconds: 0.01,
    state: "healthy",
    modelIds: ["engine-model"],
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("model discovery", () => {
  it("uses healthy engine discovery for generic backends", async () => {
    expect((await (await GET()).json()).data).toEqual([
      { id: "engine-model", object: "model" },
    ]);
    expect(upstream.fetchUpstreamEngineProbe).toHaveBeenCalledTimes(1);
  });

  it("skips engine management in unified router mode", async () => {
    vi.stubEnv("WORKSTATION_UNIFIED_ROUTER_MODE", "true");
    const data = await (await GET()).json();
    expect(upstream.fetchUpstreamEngineProbe).not.toHaveBeenCalled();
    expect(data.data).toEqual([
      { id: "model-a", object: "model" },
      { id: "model-b", object: "model" },
    ]);
    expect(data.liveModelSwitchSupported).toBe(true);
    expect(data.engineReady).toBe(true);
  });
});
