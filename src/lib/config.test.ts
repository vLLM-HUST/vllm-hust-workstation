// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { getAppConfig } from "./config";

afterEach(() => vi.unstubAllEnvs());

it("never serializes a configured default model into the public app config", () => {
  vi.stubEnv("DEFAULT_MODEL", "zai-org/GLM-4-32B-0414");
  expect(getAppConfig()).not.toHaveProperty("defaultModel");
  expect(JSON.stringify(getAppConfig())).not.toContain("GLM-4-32B");
});
