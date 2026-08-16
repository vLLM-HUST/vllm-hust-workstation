import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getServerApiKey } from "./runtimeSecret";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function fixture(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "workstation-secret-"));
  const file = path.join(dir, "runtime.env");
  fs.writeFileSync(file, content, { mode: 0o600 });
  return file;
}

describe("runtime upstream secret resolution", () => {
  it("refreshes a rotated shared env value without reloading the module", () => {
    const file = fixture("VLLM_HUST_API_KEY=first\n");
    process.env.VLLM_HUST_API_KEY_ENV_FILE = file;
    process.env.VLLM_HUST_API_KEY_ENV_NAME = "VLLM_HUST_API_KEY";
    process.env.VLLM_HUST_API_KEY = "stale-process-value";

    expect(getServerApiKey()).toBe("first");
    fs.writeFileSync(file, "VLLM_HUST_API_KEY='second'\n", { mode: 0o600 });
    expect(getServerApiKey()).toBe("second");
  });

  it("prefers a dedicated secret file over inherited process state", () => {
    const file = fixture("file-key\n");
    process.env.VLLM_HUST_API_KEY_FILE = file;
    process.env.VLLM_HUST_API_KEY = "stale-process-value";
    expect(getServerApiKey()).toBe("file-key");
  });

  it("fails closed when an explicitly configured source is empty", () => {
    process.env.VLLM_HUST_API_KEY_ENV_FILE = fixture("OTHER=value\n");
    process.env.VLLM_HUST_API_KEY_ENV_NAME = "VLLM_HUST_API_KEY";
    process.env.VLLM_HUST_API_KEY = "stale-process-value";
    expect(() => getServerApiKey()).toThrow("source is empty");
  });
});
