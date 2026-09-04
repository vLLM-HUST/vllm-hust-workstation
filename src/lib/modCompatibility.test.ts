import { expect, it } from "vitest";
import { assessModCompatibility } from "./modCompatibility";
import type { RuntimeProvenance } from "./runtimeProvenance";

function runtime(coreVersion = "0.28.1rc1.dev319+g762f85b31", pluginVersion = "0.25.1rc1+hust.20260903"): RuntimeProvenance {
  return {
    available: true,
    source: "docker-inspect-receipt",
    vllmHust: "762f85b311fbab0bcf8921dd216f5093cd58b9b8",
    vllmAscendHust: "4e57439e00000000000000000000000000000000",
    components: {
      core: { name: "vLLM-HUST", repository: "", commitUrl: "", commit: "762f85b311fbab0bcf8921dd216f5093cd58b9b8", version: coreVersion },
      plugin: { name: "vLLM-Ascend-HUST", repository: "", commitUrl: "", commit: "4e57439e00000000000000000000000000000000", version: pluginVersion },
    },
    verification: { status: "verified", checkedAt: "2026-09-04T00:00:00Z", receiptAgeSeconds: 10, message: "fixture", processSource: "not-attested" },
  };
}

it("marks every fixed catalog pin incompatible with the verified current runtime", () => {
  const current = runtime();
  for (const id of ["bidkv", "diffspec", "latchmoe"]) {
    const result = assessModCompatibility(id, current);
    expect(result.status).toBe("incompatible");
    expect(result.reason).toMatch(/要求|manifest/);
  }
});

it("does not promote a matching version declaration to compatible without admission evidence", () => {
  expect(assessModCompatibility("bidkv", runtime("0.23.9", "0.25.1")).status).toBe("unverified");
  expect(assessModCompatibility("diffspec", runtime("0.28.1", "0.23.8")).status).toBe("unverified");
});

it("reports missing or stale runtime evidence as unverified", () => {
  const missing = { ...runtime(), available: false };
  const stale = { ...runtime(), verification: { ...runtime().verification!, status: "stale" as const } };
  expect(assessModCompatibility("bidkv", missing).status).toBe("unverified");
  expect(assessModCompatibility("latchmoe", stale).status).toBe("unverified");
});
