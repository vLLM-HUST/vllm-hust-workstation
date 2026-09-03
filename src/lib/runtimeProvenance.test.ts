import { describe, expect, it } from "vitest";
import { parseRuntimeProvenance, verifyRuntimeProvenance } from "@/lib/runtimeProvenance";

const coreCommit = "7c82451c03818d23746c962c173ffb1dbc78891b";
const pluginCommit = "c47b0f07e242f5c8e52191d531879eae340c5e64";
const imageDigest = `sha256:${"6".repeat(64)}`;

function receipt(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    schema: "vllm-hust.workstation-runtime-provenance/v2",
    source: "docker-inspect-receipt",
    capturedAt: "2026-09-01T09:00:00.000Z",
    container: { name: "runtime", id: "a".repeat(64), startedAt: "2026-09-01T08:00:00.000Z" },
    image: { reference: "runtime:locked", id: imageDigest, digest: imageDigest, createdAt: "2026-09-01T08:00:00Z" },
    runtimeLock: { schema: "vllm-hust.production-runtime-lock/v2", sourceMode: "immutable-wheels" },
    compatibility: {
      base: "official v0.23.0 filesystem + CANN 9.1.0 only",
      stableRelease: "v0.23.0",
      sourceProfile: "latest-main-snapshot",
      vllmPackage: "0.28.1rc1.dev279+g7c82451c0.empty",
      vllmAscendPackage: "0.25.1rc1+hust.20260902",
    },
    artifactEvidence: {
      core: { version: "0.28.1rc1.dev279+g7c82451c0.empty", moduleOrigin: "/site-packages/vllm/__init__.py", wheelSha256: "1".repeat(64) },
      plugin: { version: "0.25.1rc1+hust.20260902", moduleOrigin: "/site-packages/vllm_ascend/__init__.py", wheelSha256: "2".repeat(64) },
    },
    components: {
      core: {
        name: "vLLM-HUST",
        repository: "https://github.com/vLLM-HUST/vllm-hust",
        commit: coreCommit,
        version: "0.28.1rc1.dev279+g7c82451c0",
        commitUrl: `https://github.com/vLLM-HUST/vllm-hust/commit/${coreCommit}`,
      },
      plugin: {
        name: "vLLM-Ascend-HUST",
        repository: "https://github.com/vLLM-HUST/vllm-ascend-hust",
        commit: pluginCommit,
        version: "0.25.1rc1+hust.20260902",
        commitUrl: `https://github.com/vLLM-HUST/vllm-ascend-hust/commit/${pluginCommit}`,
      },
    },
    ...overrides,
  });
}

describe("runtime provenance receipt", () => {
  it("accepts canonical immutable runtime evidence", () => {
    const result = parseRuntimeProvenance(receipt());
    expect(result.available).toBe(true);
    expect(result.image?.digest).toBe(imageDigest);
    expect(result.vllmHust).toBe(coreCommit);
    expect(result.vllmAscendHust).toBe(pluginCommit);
  });

  it("rejects legacy repositories rather than presenting them as runtime truth", () => {
    const result = parseRuntimeProvenance(receipt({
      components: {
        core: {
          name: "vLLM-HUST",
          repository: "https://github.com/intellistream/vllm-hust",
          commit: coreCommit,
          commitUrl: `https://github.com/intellistream/vllm-hust/commit/${coreCommit}`,
        },
        plugin: {
          name: "vLLM-Ascend-HUST",
          repository: "https://github.com/vLLM-HUST/vllm-ascend-hust",
          commit: pluginCommit,
          commitUrl: `https://github.com/vLLM-HUST/vllm-ascend-hust/commit/${pluginCommit}`,
        },
      },
    }));
    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/canonical/);
  });

  it("rejects malformed digests and never falls back to host package metadata", () => {
    const result = parseRuntimeProvenance(receipt({ image: { reference: "runtime:latest", id: "dirty", digest: "latest" } }));
    expect(result.available).toBe(false);
    expect(result.vllmHust).toBe("unavailable");
  });

  it("rejects receipts without the trusted production runtime lock", () => {
    const result = parseRuntimeProvenance(receipt({
      runtimeLock: { schema: "untrusted/v1", sourceMode: "editable" },
    }));
    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/runtime lock/);
  });
});

describe("runtime provenance live/freshness boundary", () => {
  const now = Date.parse("2026-09-01T10:00:00Z");
  const live = { id: "a".repeat(64), image: imageDigest, startedAt: "2026-09-01T08:00:00.000Z", running: true };
  it("verifies fresh container identity without claiming process attestation", () => {
    const result = verifyRuntimeProvenance(parseRuntimeProvenance(receipt()), live, now);
    expect(result.available).toBe(true);
    expect(result.verification?.status).toBe("verified");
    expect(result.verification?.processSource).toBe("not-attested");
  });
  it("rejects stale evidence even when the container still matches", () => {
    const result = verifyRuntimeProvenance(parseRuntimeProvenance(receipt()), live, now + 86400000);
    expect(result.available).toBe(false);
    expect(result.verification?.status).toBe("stale");
  });
  it("rejects future-dated evidence", () => {
    expect(verifyRuntimeProvenance(parseRuntimeProvenance(receipt()), live, now - 7200000).available).toBe(false);
  });
  it.each([
    { ...live, id: "b".repeat(64) },
    { ...live, image: `sha256:${"b".repeat(64)}` },
    { ...live, running: false },
    { ...live, startedAt: "2026-09-01T09:30:00Z" },
  ])("rejects changed/stopped/restarted containers", (identity) => {
    const result = verifyRuntimeProvenance(parseRuntimeProvenance(receipt()), identity, now);
    expect(result.available).toBe(false);
    expect(result.verification?.status).toBe("mismatch");
  });
  it("fails closed when Docker is unavailable", () => {
    expect(verifyRuntimeProvenance(parseRuntimeProvenance(receipt()), null, now).verification?.status).toBe("unverified");
  });
  it("rejects label-only receipts without installed artifact evidence", () => {
    const result = verifyRuntimeProvenance(parseRuntimeProvenance(receipt({ artifactEvidence: undefined })), live, now);
    expect(result.available).toBe(false);
  });
  it.each(["null", "[]", "42", '{"schema":"vllm-hust.workstation-runtime-provenance/v2","source":"docker-inspect-receipt","components":{}}'])("handles malformed records without throwing", (raw) => {
    expect(parseRuntimeProvenance(raw).available).toBe(false);
  });
});
