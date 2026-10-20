import { describe, expect, it } from "vitest";
import { parseHostObservation, parseRuntimeProvenance } from "./runtimeProvenance";
import { assessModCompatibility } from "./modCompatibility";

const now = Date.parse("2026-10-20T06:30:00Z");
const service = "qwen35.service";
const sample = {
  schema: "vllm-hust.workstation-host-observation/v1", service, pid: 1234,
  startTicks: "12345", bootId: "12345678-1234-1234-1234-123456789abc",
  model: "Qwen/Qwen3.5-35B-A3B", coveredModels: ["Qwen/Qwen3.5-35B-A3B-A100"],
  routerService: "router.service", routerPid: 567, routeDigest: `sha256:${"c".repeat(64)}`,
  startedAt: "2026-10-13T08:00:00Z", observedAt: new Date(now).toISOString(),
  version: "0.1.dev1+g1234567.cu128", repository: "https://github.com/vLLM-HUST/vllm-hust",
  commit: "a".repeat(40), commitUrl: `https://github.com/vLLM-HUST/vllm-hust/commit/${"a".repeat(40)}`,
  sourceDigest: `sha256:${"b".repeat(64)}`, trackedAndNativeFiles: 3200, nativeArtifacts: 17, dirty: false,
};
describe("live host source provenance boundary", () => {
  it("keeps host scope separate from Docker/Ascend artifacts and MOD approval", () => {
    const result = parseHostObservation(JSON.stringify(sample), service, now);
    expect(result.available).toBe(true);
    expect(result.hostEvidence?.coveredModels).toEqual(["Qwen/Qwen3.5-35B-A3B-A100"]);
    expect(result.image).toBeUndefined(); expect(result.container).toBeUndefined();
    expect(result.components).toBeUndefined(); expect(result.vllmAscendHust).toBe("not-applicable");
    expect(result.verification?.processSource).toBe("not-attested");
    expect(assessModCompatibility("bidkv", result).status).toBe("unverified");
  });
  it.each([
    { service: "other.service" }, { pid: 0 }, { startTicks: "" }, { bootId: "boot" },
    { observedAt: new Date(now - 31000).toISOString() }, { observedAt: new Date(now + 6000).toISOString() },
    { startedAt: "tomorrow" }, { startedAt: new Date(now + 1000).toISOString() },
    { dirty: true }, { coveredModels: [] }, { coveredModels: [3] }, { nativeArtifacts: 0 },
    { trackedAndNativeFiles: 0 }, { sourceDigest: "latest" }, { commitUrl: "https://example.org" },
    { repository: "legacy-source-rejected" }, { version: "" }, { schema: "host-source-receipt/v3" },
    { routerService: "other;sh" }, { routerPid: 0 }, { routeDigest: "mutable" },
  ])("rejects invalid, stale, dirty or unrelated observation: %j", changes => {
    expect(parseHostObservation(JSON.stringify({ ...sample, ...changes }), service, now).available).toBe(false);
  });
  it.each(["null", "[]", "{}", "not json"])("fails closed for malformed output %s", raw => {
    expect(parseHostObservation(raw, service, now).available).toBe(false);
  });
  it("continues rejecting old untrusted host receipts instead of relabeling them", () => {
    expect(parseRuntimeProvenance(JSON.stringify({ schema: "vllm-hust.workstation-runtime-provenance/v3", source: "host-source-receipt" })).available).toBe(false);
  });
});
