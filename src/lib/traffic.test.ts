import { describe, expect, it } from "vitest";
import { parseTrafficSnapshot } from "@/lib/traffic";

function validSnapshot() {
  const window = {
    requests: 2,
    successes: 1,
    errors: 1,
    rateLimited: 0,
    p50LatencyMs: 10,
    p95LatencyMs: 20,
  };
  return {
    generatedAt: 1_791_015_842_595,
    retentionDays: 30,
    activeRequests: 1,
    activeKeys: 1,
    configuredConcurrency: 40,
    engineMaxSequences: 16,
    totalRequests: 131,
    totalSuccesses: 115,
    windows: { "1m": window, "5m": window, "1h": window, "24h": window },
    series: [{ time: 1_791_015_300_000, requests: 2, errors: 1, p50LatencyMs: 10 }],
    models: [
      {
        id: "Qwen/Qwen3.8-27B",
        backendId: "a100-qwen38",
        displayName: "Qwen3.8-27B",
        hardware: "2× NVIDIA A100",
        activeRequests: 0,
        activeKeys: 0,
        totalRequests: 72,
        totalSuccesses: 68,
        lastRequestAt: 1_791_015_300_000,
        lastSuccessAt: 1_791_015_300_000,
        windows: { "1m": window, "5m": window, "1h": window, "24h": window },
        series: [{ time: 1_791_015_300_000, requests: 2, errors: 1, p50LatencyMs: 10 }],
      },
      {
        id: "Qwen/Qwen3.5-35B-A3B",
        backendId: "a6000-qwen35",
        displayName: "Qwen3.5-35B-A3B",
        hardware: "5× NVIDIA A6000",
        activeRequests: 0,
        activeKeys: 0,
        totalRequests: 40,
        totalSuccesses: 38,
        lastRequestAt: null,
        lastSuccessAt: null,
        windows: { "1m": window, "5m": window, "1h": window, "24h": window },
        series: [],
      },
    ],
  };
}

describe("parseTrafficSnapshot", () => {
  it("accepts the aggregate-only unified router schema", () => {
    expect(parseTrafficSnapshot(validSnapshot())).toEqual(validSnapshot());
  });

  it("rejects a snapshot with an incomplete window", () => {
    const snapshot = validSnapshot();
    delete (snapshot.windows["1h"] as Partial<(typeof snapshot.windows)["1h"]>).p95LatencyMs;
    expect(parseTrafficSnapshot(snapshot)).toBeUndefined();
  });

  it("rejects negative counters", () => {
    const snapshot = validSnapshot();
    snapshot.activeRequests = -1;
    expect(parseTrafficSnapshot(snapshot)).toBeUndefined();
  });

  it("rejects invalid per-model metadata", () => {
    const snapshot = validSnapshot();
    snapshot.models[0].backendId = "";
    expect(parseTrafficSnapshot(snapshot)).toBeUndefined();
  });

  it("keeps aggregate compatibility when an older snapshot has no model split", () => {
    const snapshot = validSnapshot();
    delete (snapshot as Partial<typeof snapshot>).models;
    expect(parseTrafficSnapshot(snapshot)?.models).toEqual([]);
  });
});
