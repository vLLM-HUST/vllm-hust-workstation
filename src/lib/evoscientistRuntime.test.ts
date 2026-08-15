import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createEvoScientistConfigRoot,
  probeEvoScientistRuntime,
  removeEvoScientistConfigRoot,
  resolvePythonBinary,
} from "./server/evoscientist";

const originalEnv = { ...process.env };
const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "workstation-evosci-test-"));
  tempDirs.push(dir);
  return dir;
}

function executable(filePath: string, body: string): void {
  writeFileSync(filePath, body, "utf8");
  chmodSync(filePath, 0o755);
}

afterEach(() => {
  process.env = { ...originalEnv };
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("EvoScientist runtime selection", () => {
  it("prefers the checkout's locked virtual environment", () => {
    const workdir = tempDir();
    const binDir = join(workdir, ".venv", "bin");
    mkdirSync(binDir, { recursive: true });
    const python = join(binDir, "python");
    executable(python, "#!/bin/sh\nexit 0\n");

    delete process.env.WORKSTATION_EVOSCI_PYTHON_BIN;
    process.env.WORKSTATION_EVOSCI_WORKDIR = workdir;
    process.env.WORKSTATION_EVOSCI_BIN = join(workdir, "missing-evosci");
    process.env.PATH = "";

    expect(resolvePythonBinary()).toBe(python);
  });

  it("marks a runtime ready only when its import probe succeeds", async () => {
    const workdir = tempDir();
    const good = join(workdir, "good-python");
    const bad = join(workdir, "bad-python");
    executable(good, "#!/bin/sh\nexit 0\n");
    executable(bad, "#!/bin/sh\nexit 1\n");

    await expect(probeEvoScientistRuntime(good, workdir)).resolves.toBe(true);
    await expect(probeEvoScientistRuntime(bad, workdir)).resolves.toBe(false);
  });

  it("writes discovered context capability into an isolated runtime config", () => {
    const configHome = tempDir();
    process.env.XDG_CONFIG_HOME = configHome;
    const configRoot = createEvoScientistConfigRoot({
      model: "served-model",
      baseUrl: "http://runtime.example/v1",
      apiKey: "test-only",
      contextWindowTokens: 32768,
    });
    tempDirs.push(configRoot);

    const config = readFileSync(join(configRoot, "evoscientist", "config.yaml"), "utf8");
    expect(config).toContain("context_window_tokens: 32768");
    removeEvoScientistConfigRoot(configRoot);
  });
});
