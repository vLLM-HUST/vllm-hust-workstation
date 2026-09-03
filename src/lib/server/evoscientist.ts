import {
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { DEFAULT_MODEL_ID, SERVER_CONFIG } from "@/lib/config";
import { getServerApiKey } from "@/lib/runtimeSecret";
import { getWorkstationSearchMode, isWorkstationSearchEnabled } from "@/lib/server/webSearch";
import type {
  EvoScientistAdminSnapshot,
  EvoScientistChannelWorkerStatus,
  EvoScientistConfigSnapshot,
  EvoScientistIntegrationStatus,
  EvoScientistMcpServer,
  EvoScientistSessionSummary,
  EvoScientistSkillEntry,
  EvoScientistThreadMetadata,
  EvoScientistWorkspaceOption,
} from "@/types";
import {
  canRunEvoScientistModule,
  DEFAULT_EVOSCI_BIN,
  findExecutableInPath,
  getEvoScientistSpawnEnv,
  probeEvoScientistRuntime,
  resolveEvoScientistWorkdir,
  resolvePythonBinary,
} from "./evoscientist/runtime";
import {
  fetchModelCapabilities,
  selectModelCapability,
  type ModelCapability,
} from "./evoscientist/capabilities";

export {
  canRunEvoScientistModule,
  DEFAULT_EVOSCI_BIN,
  DEFAULT_EVOSCI_WORKDIR,
  findExecutableInPath,
  getEvoScientistSpawnEnv,
  probeEvoScientistRuntime,
  PYTHON_FALLBACK_CANDIDATES,
  resolveEvoScientistWorkdir,
  resolvePythonBinary,
} from "./evoscientist/runtime";

export const DEFAULT_EVOSCI_PROVIDER = "custom-openai";
export const DEFAULT_DEV_WORKSPACE_FILE = process.env.WORKSTATION_DEV_WORKSPACE_FILE || join(homedir(), "vllm-hust-dev-hub", "vllm-hust-dev-hub.code-workspace");
export const DEFAULT_EVOSCI_CHANNEL_HEALTH_PORT = Number(process.env.WORKSTATION_EVOSCI_CHANNEL_HEALTH_PORT || "39190");
const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;
const EXCLUDED_WORKSPACE_NAMES = new Set([
  "vllm-hust-workstation",
  "vllm-hust-dev-hub",
  "reference-repos",
  "EvoScientist",
]);

type CodeWorkspaceConfig = {
  folders?: Array<{
    name?: string;
    path?: string;
  }>;
};

type ChannelWorkerMetadata = {
  pid: number;
  configRoot: string;
  healthPort: number;
  startedAt: string;
  workspaceDir: string;
  model: string;
  configuredChannels: string[];
};

type AdminScriptResult = {
  config: EvoScientistConfigSnapshot;
  skills: EvoScientistSkillEntry[];
  mcpServers: EvoScientistMcpServer[];
  channels: {
    available: string[];
    configured: string[];
    sendThinking: boolean;
    sharedWebhookPort: number;
  };
};

function getWorkstationLogsDir(): string {
  const logDir = join(process.cwd(), ".logs");
  mkdirSync(logDir, { recursive: true });
  return logDir;
}

function getChannelWorkerPidFile(): string {
  return join(getWorkstationLogsDir(), "evoscientist-channel-worker.pid");
}

function getChannelWorkerMetadataFile(): string {
  return join(getWorkstationLogsDir(), "evoscientist-channel-worker.json");
}

export function getChannelWorkerLogFile(): string {
  return join(getWorkstationLogsDir(), "evoscientist-channel-worker.log");
}

function isProcessRunning(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getEvoScientistUserConfigDir(): string {
  const xdgConfigHome = (process.env.XDG_CONFIG_HOME || "").trim();
  return xdgConfigHome
    ? resolve(xdgConfigHome, "evoscientist")
    : resolve(homedir(), ".config", "evoscientist");
}

function mergeFlatYaml(base: string, overrides: Record<string, string | boolean | number>): string {
  let next = base.trimEnd();

  for (const [key, rawValue] of Object.entries(overrides)) {
    const line = `${key}: ${formatYamlValue(rawValue)}`;
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`^${escapedKey}:.*$`, "m");
    if (pattern.test(next)) {
      next = next.replace(pattern, line);
    } else {
      next = next ? `${next}\n${line}` : line;
    }
  }

  return `${next}\n`;
}

function readChannelWorkerMetadata(): ChannelWorkerMetadata | null {
  const metadataFile = getChannelWorkerMetadataFile();
  if (!existsSync(metadataFile)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(metadataFile, "utf-8")) as ChannelWorkerMetadata;
  } catch {
    return null;
  }
}

function cleanupChannelWorkerFiles(metadata?: ChannelWorkerMetadata | null): void {
  const pidFile = getChannelWorkerPidFile();
  const metadataFile = getChannelWorkerMetadataFile();

  if (existsSync(pidFile)) {
    unlinkSync(pidFile);
  }
  if (existsSync(metadataFile)) {
    unlinkSync(metadataFile);
  }
  if (metadata?.configRoot) {
    removeEvoScientistConfigRoot(metadata.configRoot);
  }
}

function isDirectoryPath(dirPath: string): boolean {
  try {
    return statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function createWorkspaceOption(name: string, absolutePath: string): EvoScientistWorkspaceOption {
  return {
    id: absolutePath,
    name,
    path: absolutePath,
    description: basename(dirname(absolutePath)) === basename(absolutePath)
      ? absolutePath
      : `${basename(dirname(absolutePath))}/${basename(absolutePath)}`,
  };
}

function shouldExposeWorkspace(name: string): boolean {
  return !EXCLUDED_WORKSPACE_NAMES.has(name);
}

export function getEvoScientistWorkspaceOptions(): EvoScientistWorkspaceOption[] {
  if (!existsSync(DEFAULT_DEV_WORKSPACE_FILE)) {
    return [];
  }

  try {
    const payload = JSON.parse(readFileSync(DEFAULT_DEV_WORKSPACE_FILE, "utf-8")) as CodeWorkspaceConfig;
    const rootDir = dirname(DEFAULT_DEV_WORKSPACE_FILE);
    const seen = new Set<string>();
    const options: EvoScientistWorkspaceOption[] = [];

    for (const folder of payload.folders || []) {
      if (!folder.path) {
        continue;
      }

      const absolutePath = resolve(rootDir, folder.path);
      const name = (folder.name || basename(absolutePath)).trim();
      if (!name || !shouldExposeWorkspace(name) || !isDirectoryPath(absolutePath) || seen.has(absolutePath)) {
        continue;
      }

      seen.add(absolutePath);
      options.push(createWorkspaceOption(name, absolutePath));
    }

    return options;
  } catch {
    return [];
  }
}

function getPreferredWorkspaceOption(options: EvoScientistWorkspaceOption[]): EvoScientistWorkspaceOption | null {
  const configuredPath = (process.env.WORKSTATION_EVOSCI_CONTEXT_DIR || "").trim();
  if (configuredPath) {
    const resolved = resolve(configuredPath);
    const exact = options.find((item) => item.path === resolved);
    if (exact) {
      return exact;
    }
    if (isDirectoryPath(resolved)) {
      return createWorkspaceOption(basename(resolved), resolved);
    }
  }

  const preferredNames = ["vllm-hust", "vllm-ascend-hust", "vllm-hust-benchmark", "vllm-hust-docs", "vllm-hust-website"];
  for (const preferred of preferredNames) {
    const match = options.find((item) => item.name === preferred);
    if (match) {
      return match;
    }
  }

  return options[0] || null;
}

export function resolveEvoScientistWorkspacePath(requestedPath?: string | null): string {
  if (requestedPath && requestedPath.trim()) {
    const resolvedPath = resolve(requestedPath.trim());
    if (isDirectoryPath(resolvedPath)) {
      return resolvedPath;
    }
  }

  const defaultOption = getPreferredWorkspaceOption(getEvoScientistWorkspaceOptions());
  if (defaultOption) {
    return defaultOption.path;
  }

  return resolve(process.cwd(), "..");
}

export function resolveEvoScientistTimeoutMs(): number {
  const configured = Number(process.env.WORKSTATION_EVOSCI_TIMEOUT_MS || "180000");
  if (!Number.isFinite(configured) || configured <= 0) {
    return 180000;
  }
  return Math.min(Math.floor(configured), 600000);
}

function formatYamlValue(value: string | boolean | number): string {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return String(value);
  }
  return JSON.stringify(value);
}

export function createEvoScientistConfigRoot(options: {
  model: string;
  baseUrl: string;
  apiKey: string;
  contextWindowTokens?: number | null;
}): string {
  const configRoot = mkdtempSync(join(tmpdir(), "vllm-hust-evosci-"));
  const configDir = join(configRoot, "evoscientist");
  const sourceConfigDir = getEvoScientistUserConfigDir();

  if (existsSync(sourceConfigDir)) {
    cpSync(sourceConfigDir, configDir, { recursive: true });
  } else {
    mkdirSync(configDir, { recursive: true });
  }

  const baseConfig = existsSync(join(configDir, "config.yaml"))
    ? readFileSync(join(configDir, "config.yaml"), "utf-8")
    : "";

  const overrides: Record<string, string | boolean | number> = {
    provider: DEFAULT_EVOSCI_PROVIDER,
    model: options.model,
    custom_openai_api_key: options.apiKey,
    custom_openai_base_url: options.baseUrl,
    ui_backend: "cli",
    show_thinking: false,
  };
  if (options.contextWindowTokens) {
    overrides.context_window_tokens = options.contextWindowTokens;
  }

  writeFileSync(
    join(configDir, "config.yaml"),
    mergeFlatYaml(baseConfig, overrides),
    "utf-8"
  );

  return configRoot;
}

export function removeEvoScientistConfigRoot(configRoot: string): void {
  rmSync(configRoot, { recursive: true, force: true });
}

export function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "";
  }
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

export function getEvoScientistBaseUrl(): string {
  const configured = process.env.WORKSTATION_EVOSCI_BASE_URL || SERVER_CONFIG.baseUrl;
  return normalizeBaseUrl(configured);
}

export function getEvoScientistApiKey(): string {
  return (process.env.WORKSTATION_EVOSCI_API_KEY || getServerApiKey()).trim() || "not-required";
}

export function getEvoScientistApiKeyMode(): EvoScientistIntegrationStatus["apiKeyMode"] {
  if ((process.env.WORKSTATION_EVOSCI_API_KEY || "").trim()) {
    return "custom";
  }
  if ((process.env.VLLM_HUST_API_KEY || "").trim() && process.env.VLLM_HUST_API_KEY !== "not-required") {
    return "inherited";
  }
  return "not-required";
}

export function getRequestedModel(model?: string): string {
  return (
    model?.trim() ||
    process.env.WORKSTATION_EVOSCI_MODEL ||
    process.env.WORKSTATION_BOOTSTRAP_MODEL ||
    process.env.DEFAULT_MODEL ||
    DEFAULT_MODEL_ID
  );
}

export function cleanEvoScientistOutput(raw: string): string {
  return raw.replace(ANSI_PATTERN, "").replace(/\r/g, "").trim();
}

export function summarizeEvoScientistFailure(raw: string): string {
  const text = cleanEvoScientistOutput(raw);
  if (!text) {
    return "unknown error";
  }

  const missingModuleMatch = text.match(/ModuleNotFoundError:\s+No module named ['\"]([^'\"]+)['\"]/i);
  if (missingModuleMatch) {
    const missingModule = missingModuleMatch[1];
    return [
      `EvoScientist Python 环境缺少依赖模块: ${missingModule}`,
      "请安装 EvoScientist 依赖，或在 .env 中把 WORKSTATION_EVOSCI_PYTHON_BIN 指向已安装 EvoScientist 依赖的 Python 解释器。",
    ].join("\n");
  }

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const keyLines = lines.filter((line) =>
    /(ConnectError|connection error|Failed to connect|Timed out|Error:|RuntimeError|ImportError|ModuleNotFoundError|HTTP\s*\d{3})/i.test(line)
  );

  if (keyLines.length > 0) {
    return keyLines.slice(-4).join("\n").slice(0, 2000);
  }

  return lines.slice(-12).join("\n").slice(0, 2000);
}

export function resolveEvoScientistCommand(prompt: string, workspaceDir: string): string[] {
  const configuredBin = (process.env.WORKSTATION_EVOSCI_BIN || DEFAULT_EVOSCI_BIN).trim();
  const resolvedBin = findExecutableInPath(configuredBin);
  const cliArgs = ["-p", prompt, "--ui", "cli", "--no-thinking", "--workdir", workspaceDir];

  if (resolvedBin) {
    return [resolvedBin, ...cliArgs];
  }

  const pythonBin = resolvePythonBinary();
  if (pythonBin && canRunEvoScientistModule(workspaceDir)) {
    return [pythonBin, "-m", "EvoScientist", ...cliArgs];
  }

  throw new Error(
    `Unable to locate EvoScientist CLI executable '${configuredBin}'. ` +
      `Set WORKSTATION_EVOSCI_BIN to an absolute path, or ensure ${workspaceDir} contains ` +
      `a runnable EvoScientist checkout and python/python3 is available on PATH.`
  );
}

export function resolveEvoScientistBridgeCommand(options: {
  scriptPath: string;
  threadId: string;
  workspaceDir: string;
  model: string;
  prompt?: string;
  resumePayload?: unknown;
}): string[] {
  const pythonBin = resolvePythonBinary();
  if (!pythonBin) {
    throw new Error(
      "Unable to locate a Python interpreter for EvoScientist streaming. " +
        "Set WORKSTATION_EVOSCI_PYTHON_BIN to the EvoScientist environment's python executable."
    );
  }

  const command = [
    pythonBin,
    options.scriptPath,
    "--thread-id",
    options.threadId,
    "--workspace-dir",
    options.workspaceDir,
    "--model",
    options.model,
  ];

  if (options.resumePayload !== undefined) {
    command.push("--resume-json", JSON.stringify(options.resumePayload));
  } else if (options.prompt) {
    command.push("--prompt", options.prompt);
  } else {
    throw new Error("Either prompt or resumePayload must be provided for EvoScientist streaming.");
  }

  return command;
}

export async function runEvoScientistJsonScript<T>(options: {
  scriptName: string;
  args?: string[];
  configRoot?: string;
  env?: NodeJS.ProcessEnv;
  workspaceDir?: string;
}): Promise<T> {
  const pythonBin = resolvePythonBinary();
  if (!pythonBin) {
    throw new Error("Unable to locate a Python interpreter for EvoScientist utilities.");
  }

  const workdir = resolveEvoScientistWorkdir();
  const scriptPath = join(process.cwd(), "scripts", options.scriptName);
  const { spawn } = await import("node:child_process");

  return await new Promise<T>((resolvePromise, rejectPromise) => {
    const child = spawn(pythonBin, [scriptPath, ...(options.args || [])], {
      cwd: workdir,
      env: {
        ...getEvoScientistSpawnEnv({ workdir, configRoot: options.configRoot }),
        ...(options.workspaceDir ? { EVOSCIENTIST_WORKSPACE_DIR: options.workspaceDir } : {}),
        ...(options.env || {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });
    child.on("error", (error) => rejectPromise(error));
    child.on("close", (code) => {
      if (code !== 0) {
        rejectPromise(new Error(cleanEvoScientistOutput(stderr) || `utility script exited with code ${code}`));
        return;
      }
      try {
        resolvePromise(JSON.parse(stdout) as T);
      } catch (error) {
        rejectPromise(error as Error);
      }
    });
  });
}

export async function getEvoScientistSessionSummaries(limit = 30): Promise<EvoScientistSessionSummary[]> {
  const payload = await runEvoScientistJsonScript<{ threads?: EvoScientistSessionSummary[] }>({
    scriptName: "evoscientist_sessions.py",
    args: ["list", "--limit", String(limit)],
  });
  return payload.threads || [];
}

export async function getEvoScientistThreadMetadata(threadId: string): Promise<EvoScientistThreadMetadata | null> {
  const payload = await runEvoScientistJsonScript<EvoScientistThreadMetadata | null>({
    scriptName: "evoscientist_sessions.py",
    args: ["metadata", "--thread-id", threadId],
  });
  if (!payload || typeof payload !== "object") {
    return null;
  }
  return payload;
}

export async function getEvoScientistAdminSnapshot(workspaceDir?: string): Promise<EvoScientistAdminSnapshot> {
  const payload = await runEvoScientistJsonScript<AdminScriptResult>({
    scriptName: "evoscientist_admin.py",
    args: ["snapshot"],
    workspaceDir: workspaceDir ? resolveEvoScientistWorkspacePath(workspaceDir) : resolveEvoScientistWorkspacePath(),
  });

  return {
    ...payload,
    channels: {
      ...payload.channels,
      worker: await getEvoScientistChannelWorkerStatus(),
    },
  };
}

export async function setEvoScientistConfigValues(values: Record<string, unknown>, workspaceDir?: string): Promise<void> {
  await runEvoScientistJsonScript<{ success: boolean }>({
    scriptName: "evoscientist_admin.py",
    args: ["set-config-values", "--payload-json", JSON.stringify(values)],
    workspaceDir: workspaceDir ? resolveEvoScientistWorkspacePath(workspaceDir) : resolveEvoScientistWorkspacePath(),
  });
}

export async function installEvoScientistSkill(source: string, workspaceDir?: string): Promise<void> {
  await runEvoScientistJsonScript<{ success: boolean }>({
    scriptName: "evoscientist_admin.py",
    args: ["skills-install", "--source", source],
    workspaceDir: workspaceDir ? resolveEvoScientistWorkspacePath(workspaceDir) : resolveEvoScientistWorkspacePath(),
  });
}

export async function uninstallEvoScientistSkill(name: string, workspaceDir?: string): Promise<void> {
  await runEvoScientistJsonScript<{ success: boolean }>({
    scriptName: "evoscientist_admin.py",
    args: ["skills-uninstall", "--name", name],
    workspaceDir: workspaceDir ? resolveEvoScientistWorkspacePath(workspaceDir) : resolveEvoScientistWorkspacePath(),
  });
}

export async function upsertEvoScientistMcpServer(payload: Record<string, unknown>, workspaceDir?: string): Promise<void> {
  await runEvoScientistJsonScript<{ success: boolean }>({
    scriptName: "evoscientist_admin.py",
    args: ["mcp-upsert", "--payload-json", JSON.stringify(payload)],
    workspaceDir: workspaceDir ? resolveEvoScientistWorkspacePath(workspaceDir) : resolveEvoScientistWorkspacePath(),
  });
}

export async function removeEvoScientistMcpServer(name: string, workspaceDir?: string): Promise<void> {
  await runEvoScientistJsonScript<{ success: boolean }>({
    scriptName: "evoscientist_admin.py",
    args: ["mcp-remove", "--name", name],
    workspaceDir: workspaceDir ? resolveEvoScientistWorkspacePath(workspaceDir) : resolveEvoScientistWorkspacePath(),
  });
}

export async function updateEvoScientistChannelsConfig(payload: {
  enabled: string[];
  sendThinking: boolean;
  sharedWebhookPort: number;
}, workspaceDir?: string): Promise<void> {
  await runEvoScientistJsonScript<{ success: boolean }>({
    scriptName: "evoscientist_admin.py",
    args: ["channels-update", "--payload-json", JSON.stringify(payload)],
    workspaceDir: workspaceDir ? resolveEvoScientistWorkspacePath(workspaceDir) : resolveEvoScientistWorkspacePath(),
  });
}

export async function getEvoScientistChannelWorkerStatus(): Promise<EvoScientistChannelWorkerStatus> {
  const metadata = readChannelWorkerMetadata();
  if (!metadata || !isProcessRunning(metadata.pid)) {
    cleanupChannelWorkerFiles(metadata);
    return {
      running: false,
      pid: null,
      healthPort: metadata?.healthPort || DEFAULT_EVOSCI_CHANNEL_HEALTH_PORT,
      healthUrl: metadata?.healthPort ? `http://127.0.0.1:${metadata.healthPort}/healthz` : null,
      startedAt: null,
      workspaceDir: metadata?.workspaceDir || null,
      model: metadata?.model || null,
      configuredChannels: metadata?.configuredChannels || [],
      runtime: null,
      logFile: getChannelWorkerLogFile(),
    };
  }

  const healthUrl = `http://127.0.0.1:${metadata.healthPort}/healthz`;
  let runtime: Record<string, unknown> | null = null;
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1500) });
    if (response.ok) {
      runtime = (await response.json()) as Record<string, unknown>;
    }
  } catch {
    runtime = null;
  }

  return {
    running: true,
    pid: metadata.pid,
    healthPort: metadata.healthPort,
    healthUrl,
    startedAt: metadata.startedAt,
    workspaceDir: metadata.workspaceDir,
    model: metadata.model,
    configuredChannels: metadata.configuredChannels,
    runtime,
    logFile: getChannelWorkerLogFile(),
  };
}

export async function startEvoScientistChannelWorker(options: {
  workspaceDir: string;
  model: string;
  configuredChannels: string[];
}): Promise<EvoScientistChannelWorkerStatus> {
  const existing = await getEvoScientistChannelWorkerStatus();
  if (existing.running) {
    return existing;
  }

  const pythonBin = resolvePythonBinary();
  if (!pythonBin) {
    throw new Error("Unable to locate a Python interpreter for EvoScientist channel worker.");
  }

  const workdir = resolveEvoScientistWorkdir();
  const capability = await resolveServedModelCapability(options.model);
  const configRoot = createEvoScientistConfigRoot({
    model: capability.id,
    baseUrl: getEvoScientistBaseUrl(),
    apiKey: getEvoScientistApiKey(),
    contextWindowTokens: capability.maxContextTokens,
  });
  const command = [
    pythonBin,
    join(process.cwd(), "scripts", "evoscientist_channel_worker.py"),
    "--workspace-dir",
    options.workspaceDir,
    "--health-port",
    String(DEFAULT_EVOSCI_CHANNEL_HEALTH_PORT),
  ];
  const logFile = getChannelWorkerLogFile();
  const stdoutFd = openSync(logFile, "a");
  const stderrFd = openSync(logFile, "a");
  const { spawn } = await import("node:child_process");

  try {
    const child = spawn(command[0], command.slice(1), {
      cwd: workdir,
      env: getEvoScientistSpawnEnv({
        configRoot,
        apiKey: getEvoScientistApiKey(),
        baseUrl: getEvoScientistBaseUrl(),
        workdir,
        contextWindowTokens: capability.maxContextTokens ?? undefined,
      }),
      detached: true,
      stdio: ["ignore", stdoutFd, stderrFd],
    });

    child.unref();

    const metadata: ChannelWorkerMetadata = {
      pid: child.pid ?? 0,
      configRoot,
      healthPort: DEFAULT_EVOSCI_CHANNEL_HEALTH_PORT,
      startedAt: new Date().toISOString(),
      workspaceDir: options.workspaceDir,
      model: capability.id,
      configuredChannels: options.configuredChannels,
    };
    writeFileSync(getChannelWorkerPidFile(), `${metadata.pid}\n`, "utf-8");
    writeFileSync(getChannelWorkerMetadataFile(), JSON.stringify(metadata, null, 2), "utf-8");
  } finally {
    closeSync(stdoutFd);
    closeSync(stderrFd);
  }

  await new Promise((resolvePromise) => setTimeout(resolvePromise, 1500));
  return getEvoScientistChannelWorkerStatus();
}

export async function stopEvoScientistChannelWorker(): Promise<EvoScientistChannelWorkerStatus> {
  const metadata = readChannelWorkerMetadata();
  if (!metadata) {
    return getEvoScientistChannelWorkerStatus();
  }

  if (isProcessRunning(metadata.pid)) {
    try {
      process.kill(metadata.pid, "SIGTERM");
    } catch {
      // Ignore race on shutdown.
    }

    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && isProcessRunning(metadata.pid)) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
    }

    if (isProcessRunning(metadata.pid)) {
      try {
        process.kill(metadata.pid, "SIGKILL");
      } catch {
        // Ignore race on force kill.
      }
    }
  }

  cleanupChannelWorkerFiles(metadata);
  return getEvoScientistChannelWorkerStatus();
}

function configuredContextWindow(): number | null {
  const raw = (process.env.WORKSTATION_EVOSCI_CONTEXT_WINDOW_TOKENS || "").trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export async function resolveServedModelCapability(
  preferredModel?: string
): Promise<ModelCapability> {
  const requestedModels = [
    getRequestedModel(preferredModel),
    process.env.WORKSTATION_EVOSCI_MODEL,
    process.env.WORKSTATION_BOOTSTRAP_MODEL,
    process.env.DEFAULT_MODEL,
    DEFAULT_MODEL_ID,
  ].filter((value): value is string => Boolean(value && value.trim()));
  const fallback = {
    id: requestedModels[0] || DEFAULT_MODEL_ID,
    maxContextTokens: configuredContextWindow(),
  };

  try {
    const capabilities = await fetchModelCapabilities({
      baseUrl: SERVER_CONFIG.baseUrl,
      apiKey: getServerApiKey(),
    });
    const selected = selectModelCapability(requestedModels, capabilities);
    return selected
      ? { ...selected, maxContextTokens: selected.maxContextTokens ?? fallback.maxContextTokens }
      : fallback;
  } catch {
    return fallback;
  }
}

export async function resolveServedModel(preferredModel?: string): Promise<string> {
  return (await resolveServedModelCapability(preferredModel)).id;
}

export async function getEvoScientistIntegrationStatus(preferredModel?: string): Promise<EvoScientistIntegrationStatus> {
  const workdir = resolveEvoScientistWorkdir();
  const configuredModel = getRequestedModel(preferredModel);
  const pythonBin = resolvePythonBinary();
  const commandMode = findExecutableInPath((process.env.WORKSTATION_EVOSCI_BIN || DEFAULT_EVOSCI_BIN).trim())
    ? "binary"
    : pythonBin && canRunEvoScientistModule(workdir)
      ? "python-module"
      : "unavailable";

  let resolvedModel: string | null = null;
  let backendReachable = false;
  try {
    const capabilities = await fetchModelCapabilities({
      baseUrl: SERVER_CONFIG.baseUrl,
      apiKey: getServerApiKey(),
    });
    backendReachable = capabilities.length > 0;
    resolvedModel = selectModelCapability([configuredModel], capabilities)?.id ?? configuredModel;
  } catch {
    resolvedModel = null;
    backendReachable = false;
  }

  const bridgeReady = Boolean(
    pythonBin &&
    (commandMode === "binary" || canRunEvoScientistModule(workdir)) &&
    await probeEvoScientistRuntime(pythonBin, workdir)
  );

  return {
    provider: DEFAULT_EVOSCI_PROVIDER,
    baseUrl: getEvoScientistBaseUrl(),
    apiKeyMode: getEvoScientistApiKeyMode(),
    configuredModel,
    resolvedModel,
    workdir,
    pythonBin,
    commandMode,
    searchEnabled: isWorkstationSearchEnabled(),
    searchMode: getWorkstationSearchMode(),
    backendReachable,
    ready: backendReachable && bridgeReady,
  };
}
