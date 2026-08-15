import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isLocalBackendControlEnabled } from "./config";

const ORIGINAL_MODE = process.env.WORKSTATION_BACKEND_MODE;
const ORIGINAL_CONTROL = process.env.WORKSTATION_LOCAL_BACKEND_CONTROL_ENABLED;

afterEach(() => {
  if (ORIGINAL_MODE === undefined) delete process.env.WORKSTATION_BACKEND_MODE;
  else process.env.WORKSTATION_BACKEND_MODE = ORIGINAL_MODE;
  if (ORIGINAL_CONTROL === undefined) delete process.env.WORKSTATION_LOCAL_BACKEND_CONTROL_ENABLED;
  else process.env.WORKSTATION_LOCAL_BACKEND_CONTROL_ENABLED = ORIGINAL_CONTROL;
});

describe("shared backend safety", () => {
  it("disables local process control in external mode", () => {
    delete process.env.WORKSTATION_LOCAL_BACKEND_CONTROL_ENABLED;
    process.env.WORKSTATION_BACKEND_MODE = "external";
    expect(isLocalBackendControlEnabled()).toBe(false);
  });

  it("allows an explicit local-control override", () => {
    process.env.WORKSTATION_BACKEND_MODE = "external";
    process.env.WORKSTATION_LOCAL_BACKEND_CONTROL_ENABLED = "true";
    expect(isLocalBackendControlEnabled()).toBe(true);
  });

  it("does not expose the upstream URL or API key through next config env", () => {
    const config = fs.readFileSync(path.join(process.cwd(), "next.config.mjs"), "utf8");
    const envBlock = config.match(/env:\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
    expect(envBlock).not.toContain("VLLM_HUST_API_KEY");
    expect(envBlock).not.toContain("VLLM_HUST_BASE_URL");
  });

  it("loads shared env credentials only in the server runtime launcher", () => {
    const launcher = fs.readFileSync(
      path.join(process.cwd(), "scripts/run_workstation_systemd.sh"),
      "utf8"
    );
    expect(launcher).toContain("VLLM_HUST_API_KEY_ENV_FILE");
    expect(launcher).toContain("VLLM_HUST_API_KEY_ENV_NAME");
    expect(launcher).toContain("source \"$VLLM_HUST_API_KEY_ENV_FILE\"");
  });
});
