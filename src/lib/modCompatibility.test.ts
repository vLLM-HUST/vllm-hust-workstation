import { expect, it } from "vitest";
import { assessModCompatibility, currentCompatibility } from "./modCompatibility";
import type { RuntimeProvenance } from "./runtimeProvenance";

function runtime(coreVersion = "0.28.1rc1.dev319+g762f85b31", pluginVersion = "0.25.1rc1+hust.20260903"): RuntimeProvenance {
  return {
    available: true,
    source: "docker-inspect-receipt",
    vllmHust: "762f85b311fbab0bcf8921dd216f5093cd58b9b8",
    vllmAscendHust: "4e57439e58ed3d78e675f9fd7b4614fb183c5394",
    components: {
      core: { name: "vLLM-HUST", repository: "", commitUrl: "", commit: "762f85b311fbab0bcf8921dd216f5093cd58b9b8", version: coreVersion },
      plugin: { name: "vLLM-Ascend-HUST", repository: "", commitUrl: "", commit: "4e57439e58ed3d78e675f9fd7b4614fb183c5394", version: pluginVersion },
    },
    verification: { status: "verified", checkedAt: "2026-09-04T00:00:00Z", receiptAgeSeconds: 10, message: "fixture", processSource: "not-attested" },
  };
}

it("keeps exact host targets unverified until the candidate artifact and instance witness match", () => {
  const current = runtime();
  for (const id of ["bidkv", "diffspec", "latchmoe"]) {
    const result = assessModCompatibility(id, current);
    expect(result.status).toBe("unverified");
    expect(result.reason).toMatch(/runtime-effective|实跑|不适用/);
  }
});

it("rejects artifacts outside the exact candidate baseline", () => {
  expect(assessModCompatibility("bidkv", runtime("0.23.9", "0.25.1")).status).toBe("incompatible");
  expect(assessModCompatibility("diffspec", runtime("0.28.1", "0.23.8")).status).toBe("incompatible");
});

it("reports missing or stale runtime evidence as unverified", () => {
  const missing = { ...runtime(), available: false };
  const stale = { ...runtime(), verification: { ...runtime().verification!, status: "stale" as const } };
  expect(assessModCompatibility("bidkv", missing).status).toBe("unverified");
  expect(assessModCompatibility("latchmoe", stale).status).toBe("unverified");
});

it("projects insufficient evidence as explicit API unknown", () => {
  const assessment = assessModCompatibility("bidkv", { ...runtime(), available: false });
  expect(currentCompatibility(assessment)).toMatchObject({
    status: "unknown",
    label: "未核验",
    reason: expect.stringContaining("尚未核验"),
  });
});
