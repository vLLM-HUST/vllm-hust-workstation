// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { getAppConfig, isUnifiedRouterMode } from "./config";

afterEach(() => vi.unstubAllEnvs());

it("never serializes a configured default model into the public app config", () => {
  vi.stubEnv("DEFAULT_MODEL", "zai-org/GLM-4-32B-0414");
  expect(getAppConfig()).not.toHaveProperty("defaultModel");
  expect(JSON.stringify(getAppConfig())).not.toContain("GLM-4-32B");
});

it("enables unified router behavior only when explicitly configured", () => {
  expect(isUnifiedRouterMode()).toBe(false);
  vi.stubEnv("WORKSTATION_UNIFIED_ROUTER_MODE", "true");
  expect(isUnifiedRouterMode()).toBe(true);
  vi.stubEnv("WORKSTATION_UNIFIED_ROUTER_MODE", "false");
  expect(isUnifiedRouterMode()).toBe(false);
});
