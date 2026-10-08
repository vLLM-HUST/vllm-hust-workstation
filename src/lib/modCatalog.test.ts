import { describe, expect, it } from "vitest";

import rawCatalog from "../../config/mod-catalog.v1.json";
import { MOD_CATALOG, MOD_MANAGER_SHA, validateModCatalog } from "./modCatalog";

describe("generated Mod catalog", () => {
  it("loads the unique 19-entry feed generated from pinned dev-hub", () => {
    expect(validateModCatalog(rawCatalog)).toHaveLength(19);
    expect(MOD_CATALOG).toHaveLength(19);
    expect(new Set(MOD_CATALOG.map(mod => mod.id)).size).toBe(19);
    expect(MOD_MANAGER_SHA).toBe(
      "cf1ea71e3e2cb81ab06267ef05eddb3e580ea20b",
    );
  });

  it("keeps qualified availability separate from performance recommendation", () => {
    const available = MOD_CATALOG.filter(
      mod => mod.availability.status === "available",
    );
    expect(available.map(mod => mod.id)).toEqual([
      "bidkv",
      "diffspec",
      "latchmoe",
      "pipeline-microbatch",
    ]);
    expect(
      available.every(
        mod => mod.effectiveness.status === "not-beneficial-in-tested-cell",
      ),
    ).toBe(true);
    expect(available.every(mod => mod.actions.prepare)).toBe(true);
  });

  it("keeps every unqualified entry non-executable", () => {
    const previews = MOD_CATALOG.filter(
      mod => mod.availability.status === "preview",
    );
    expect(previews).toHaveLength(14);
    expect(previews.every(mod => mod.deployment === null)).toBe(true);
    expect(previews.every(mod => !Object.values(mod.actions).some(Boolean))).toBe(
      true,
    );
    const external = MOD_CATALOG.find(mod => mod.id === "pegaflow")!;
    expect(external.availability.status).toBe("external");
    expect(external.deployment).toBeNull();
  });

  it("uses merged immutable Pipeline source and qualification metadata", () => {
    const pipeline = MOD_CATALOG.find(
      mod => mod.id === "pipeline-microbatch",
    )!;
    expect(pipeline.source.sourceSha).toBe(
      "a15a22961a0e4858da74a0ab806575c82cb254e6",
    );
    expect(pipeline.sha).toBe(pipeline.source.sourceSha);
    expect(pipeline.applicability.currentModelApplicable).toBe(false);
    expect(pipeline.recommendation.status).toBe("not-recommended-tested-cell");
  });

  it("uses full immutable source SHAs for every entry", () => {
    for (const mod of MOD_CATALOG) {
      expect(mod.source.sourceSha).toMatch(/^[a-f0-9]{40}$/);
      if (mod.deployment) expect(mod.deployment.sourceSha).toMatch(/^[a-f0-9]{40}$/);
    }
  });
});
