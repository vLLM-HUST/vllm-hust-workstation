import { describe, expect, it } from "vitest";
import { parseRuntimeProvenance } from "@/lib/runtimeProvenance";

const coreCommit = "ba07e4a48fc951300d97eb506217dd530583dea3";
const pluginCommit = "40f9834ee82aadfa4656ec65e5bd84f4d6241b5f";
const imageDigest = `sha256:${"6".repeat(64)}`;

function receipt(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    schema: "vllm-hust.workstation-runtime-provenance/v2",
    source: "docker-inspect-receipt",
    capturedAt: "2026-09-01T09:00:00.000Z",
    container: { name: "runtime", id: "a".repeat(64), startedAt: "2026-09-01T08:00:00.000Z" },
    image: { reference: "runtime:locked", id: imageDigest, digest: imageDigest, createdAt: "2026-09-01T08:00:00Z" },
    runtimeLock: { schema: "vllm-hust.production-runtime-lock/v1", sourceMode: "locked-read-only-bind" },
    compatibility: { base: "vLLM-Ascend 0.23.0", vllmPackage: "0.23.0+empty", vllmAscendPackage: "0.23.0" },
    components: {
      core: {
        name: "vLLM-HUST",
        repository: "https://github.com/vLLM-HUST/vllm-hust",
        commit: coreCommit,
        version: "0.23.1rc0.dev2625+gba07e4a4",
        commitUrl: `https://github.com/vLLM-HUST/vllm-hust/commit/${coreCommit}`,
      },
      plugin: {
        name: "vLLM-Ascend-HUST",
        repository: "https://github.com/vLLM-HUST/vllm-ascend-hust",
        commit: pluginCommit,
        version: "0.0.dev20260901+g40f9834e",
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
