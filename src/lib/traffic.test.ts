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
});
