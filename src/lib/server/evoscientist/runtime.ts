import { accessSync, constants, existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join, resolve } from "node:path";

export const DEFAULT_EVOSCI_BIN = "EvoSci";
export const DEFAULT_EVOSCI_WORKDIR = join(homedir(), "EvoScientist");
export const PYTHON_FALLBACK_CANDIDATES = ["python3", "python"];

function isExecutableFile(filePath: string): boolean {
  try {
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function findSiblingPython(binaryPath: string): string | null {
  const siblingPython = resolve(binaryPath, "..", "python");
  return isExecutableFile(siblingPython) ? siblingPython : null;
}

export function findExecutableInPath(binary: string): string | null {
  if (!binary) {
    return null;
  }

  if (binary.includes("/")) {
    const resolved = resolve(binary);
    return isExecutableFile(resolved) ? resolved : null;
  }

  const pathValue = process.env.PATH || "";
  for (const entry of pathValue.split(delimiter)) {
    if (!entry) {
      continue;
    }
    const candidate = join(entry, binary);
    if (isExecutableFile(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function resolveEvoScientistWorkdir(): string {
  return resolve(process.env.WORKSTATION_EVOSCI_WORKDIR || DEFAULT_EVOSCI_WORKDIR);
}

export function resolvePythonBinary(): string | null {
  const configured = (process.env.WORKSTATION_EVOSCI_PYTHON_BIN || "").trim();
  const projectPython = join(resolveEvoScientistWorkdir(), ".venv", "bin", "python");
  const evosciBinary = findExecutableInPath(
    (process.env.WORKSTATION_EVOSCI_BIN || DEFAULT_EVOSCI_BIN).trim()
  );
  const siblingPython = evosciBinary ? findSiblingPython(evosciBinary) : null;
  const candidates = [
    ...(configured ? [configured] : []),
    projectPython,
    ...(siblingPython ? [siblingPython] : []),
    ...PYTHON_FALLBACK_CANDIDATES,
  ];

  for (const candidate of candidates) {
    const resolved = findExecutableInPath(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

export function canRunEvoScientistModule(workdir: string): boolean {
  return existsSync(join(workdir, "EvoScientist", "cli", "__init__.py"));
}

export function getEvoScientistSpawnEnv(options: {
  configRoot?: string;
  apiKey?: string;
  baseUrl?: string;
  workdir?: string;
  contextWindowTokens?: number;
}): NodeJS.ProcessEnv {
  const pythonPathEntries = [options.workdir, process.env.PYTHONPATH].filter(Boolean);

  return {
    ...process.env,
    ...(options.configRoot ? { XDG_CONFIG_HOME: options.configRoot } : {}),
    ...(options.apiKey ? { CUSTOM_OPENAI_API_KEY: options.apiKey } : {}),
    ...(options.baseUrl ? { CUSTOM_OPENAI_BASE_URL: options.baseUrl } : {}),
    ...(options.contextWindowTokens
      ? { EVOSCIENTIST_CONTEXT_WINDOW_TOKENS: String(options.contextWindowTokens) }
      : {}),
    PYTHONPATH: pythonPathEntries.join(delimiter),
    FORCE_COLOR: "0",
    CLICOLOR: "0",
    NO_COLOR: "1",
    TERM: "dumb",
  };
}

type RuntimeProbeCache = {
  key: string;
  ready: boolean;
  expiresAt: number;
};

let runtimeProbeCache: RuntimeProbeCache | null = null;

export async function probeEvoScientistRuntime(
  pythonBin: string,
  workdir: string
): Promise<boolean> {
  const key = `${pythonBin}\0${workdir}`;
  const now = Date.now();
  if (runtimeProbeCache?.key === key && runtimeProbeCache.expiresAt > now) {
    return runtimeProbeCache.ready;
  }

  const { spawn } = await import("node:child_process");
  const ready = await new Promise<boolean>((resolveProbe) => {
    const child = spawn(
      pythonBin,
      ["-c", "from datetime import UTC; import EvoScientist.sessions; import EvoScientist.cli"],
      {
        cwd: workdir,
        env: getEvoScientistSpawnEnv({ workdir }),
        stdio: "ignore",
      }
    );
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveProbe(value);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(false);
    }, 5000);
    child.on("error", () => finish(false));
    child.on("close", (code) => finish(code === 0));
  });

  runtimeProbeCache = { key, ready, expiresAt: now + 30_000 };
  return ready;
}
