import { lstat, readFile, readdir, realpath, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { MOD_CATALOG, MOD_MANAGER_SHA } from "./modCatalog";
import { assessModCompatibility, currentCompatibility } from "./modCompatibility";
import { describeHostTarget } from "./hostBrokerClient";
import { ModError, modRoot } from "./modStore";
import { getRuntimeProvenance } from "./runtimeProvenance";
import { fetchUpstreamModels } from "./upstream";
import type { ModPreparationTask, ModRuntimePayload } from "./modRuntimeTypes";

interface TargetConfig {
  schema: "workstation.mod-runtime-config/v1";
  target: { id: string; label: string; ownership: "shared" | "dedicated"; containerName: string; pythonBin: string; upstreamUrl: string };
}

function upstreamIdentity(value: string): string {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || !["http:", "https:"].includes(url.protocol)) throw new Error("invalid upstream");
  if (url.hostname === "localhost") url.hostname = "127.0.0.1";
  return url.origin + url.pathname.replace(/\/v1\/?$/, "").replace(/\/$/, "");
}

export async function runtimeConfig(): Promise<TargetConfig | null> {
  const file = process.env.WORKSTATION_MOD_RUNTIME_CONFIG?.trim();
  if (!file) return null;
  const info = await lstat(file);
  if (!path.isAbsolute(file) || !info.isFile() || info.isSymbolicLink() || await realpath(file) !== file || info.mode & 0o077 || info.uid !== process.getuid?.() || info.size > 16384) throw new ModError("实例登记文件必须由部署端私有管理。", 503);
  const config = JSON.parse(await readFile(file, "utf8")) as TargetConfig;
  const target = config?.target;
  if (config.schema !== "workstation.mod-runtime-config/v1" || !target || Object.keys(config).sort().join() !== "schema,target" || Object.keys(target).sort().join() !== "containerName,id,label,ownership,pythonBin,upstreamUrl" ||
      !/^[a-z][a-z0-9-]{0,63}$/.test(target.id) || typeof target.label !== "string" || !target.label.trim() || target.label.length > 100 ||
      !["shared", "dedicated"].includes(target.ownership) || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(target.containerName) ||
      !/^\/[A-Za-z0-9_./-]+\/python[0-9.]*$/.test(target.pythonBin) || target.pythonBin.includes("/../") ||
      target.containerName !== process.env.WORKSTATION_RUNTIME_CONTAINER || upstreamIdentity(target.upstreamUrl) !== upstreamIdentity(process.env.VLLM_HUST_BASE_URL || "http://localhost:8080")) {
    throw new ModError("登记实例与工作站上游部署不一致。", 503);
  }
  return config;
}

export async function runtimeRoot(): Promise<string> {
  const root = process.env.WORKSTATION_MOD_RUNTIME_DIR?.trim();
  if (!root || !path.isAbsolute(root) || path.resolve(root) === "/") throw new ModError("实例制品存储未配置。", 503);
  const info = await lstat(root);
  if (!info.isDirectory() || info.isSymbolicLink() || await realpath(root) !== root || info.mode & 0o077 || info.uid !== process.getuid?.()) throw new ModError("实例制品存储必须为部署端私有目录。", 503);
  return root;
}

interface PrivateTask extends ModPreparationTask {
  schema: "workstation.mod-preparation-task/v1";
  expectedIdentity: { id: string; startedAt: string; imageId: string };
  sourceSha: string;
  managerSha: string;
  receiptPath?: string;
}

async function taskRecords(root: string): Promise<PrivateTask[]> {
  const directory = path.join(root, "tasks");
  try {
    if ((await lstat(directory)).isSymbolicLink()) throw new Error("invalid task directory");
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const names = (await readdir(directory)).filter(name => /^[a-f0-9-]{36}\.json$/.test(name));
  if (names.length > 1000) throw new ModError("准备任务记录需要维护。", 503);
  const records = await Promise.all(names.map(async name => {
    const file = path.join(directory, name);
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.mode & 0o077 || info.size > 100_000) throw new Error("invalid task file");
    const task = JSON.parse(await readFile(file, "utf8")) as PrivateTask;
    if (task.schema !== "workstation.mod-preparation-task/v1" || task.id + ".json" !== name || !["queued", "preparing", "prepared", "failed", "superseded", "interrupted"].includes(task.status) || !Array.isArray(task.logs)) throw new Error("invalid preparation record");
    return task;
  }));
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function projectTask(task: PrivateTask): ModPreparationTask {
  return { id: task.id, targetId: task.targetId, modId: task.modId, status: task.status, createdAt: task.createdAt, updatedAt: task.updatedAt,
    baseImageId: task.baseImageId, imageId: task.imageId, logs: task.logs.slice(-40) };
}

export async function getModRuntime(administrator: boolean): Promise<ModRuntimePayload> {
  const config = await runtimeConfig();
  const closedLifecycle = { status: "unavailable" as const, brokerAvailable: false, instanceRegistered: false,
    identityLive: false, rollbackReady: false, oneUseAuthorization: false, reason: "运行控制尚未就绪。" };
  if (!config) return { administrator, target: null, preparationAvailable: false, applicationAvailable: false,
    lifecycle: closedLifecycle, mods: [], message: "尚未登记推理实例。", tasks: [] };
  const [provenance, models, broker] = await Promise.all([getRuntimeProvenance(), fetchUpstreamModels(), describeHostTarget(config.target.id)]);
  const verified = provenance.available && provenance.verification?.status === "verified" && provenance.container?.name === config.target.containerName;
  let root: string | undefined;
  try { root = await runtimeRoot(); await modRoot(); } catch { root = undefined; }
  const target = { id: config.target.id, label: config.target.label, ownership: config.target.ownership, identityVerified: Boolean(verified),
    ...(verified ? { imageId: provenance.image!.id, coreSha: provenance.components!.core.commit, pluginSha: provenance.components!.plugin.commit, checkedAt: provenance.verification!.checkedAt } : {}),
    models: models.reachable ? models.ids : [], observedMods: null };
  const mods = MOD_CATALOG.filter(mod => mod.sha).map(mod => ({
    id: mod.id,
    artifactQualification: mod.artifactQualification,
    currentRuntimeCompatibility: currentCompatibility(assessModCompatibility(mod.id, provenance)).status,
  }));
  const lifecycle = { status: "unavailable" as const, brokerAvailable: broker.available, instanceRegistered: broker.registered,
    identityLive: Boolean(verified), rollbackReady: false, oneUseAuthorization: false,
    reason: !verified ? "实例身份待核验。" : !broker.registered ? "当前实例尚未纳入运行控制。" : "回滚基线尚未验收。" };
  return { administrator, target, preparationAvailable: Boolean(root && verified), applicationAvailable: false, lifecycle, mods,
    message: !verified ? "实例身份暂未核验，准备操作已暂停。" : !root ? "实例制品存储尚未就绪。" : "运行环境可准备；服务切换需通过全部运行门控。",
    tasks: root && administrator ? (await taskRecords(root)).filter(task => task.targetId === target.id).slice(0, 30).map(projectTask) : [] };
}

export async function startRuntimePreparation(targetId: string, modId: string): Promise<ModPreparationTask> {
  const config = await runtimeConfig();
  if (!config || config.target.id !== targetId) throw new ModError("实例未登记。", 404);
  const mod = MOD_CATALOG.find(item => item.id === modId);
  if (!mod || !mod.sha) throw new ModError("该扩展不支持实例镜像准备。", 400);
  const provenance = await getRuntimeProvenance();
  if (!provenance.available || provenance.verification?.status !== "verified" || provenance.container?.name !== config.target.containerName) throw new ModError("实例身份未核验，请刷新后重试。");
  const root = await runtimeRoot();
  const library = await modRoot();
  if ((await taskRecords(root)).some(task => ["queued", "preparing", "interrupted"].includes(task.status))) throw new ModError("已有准备任务执行中；中断任务需先核查。");
  const task: PrivateTask = { schema: "workstation.mod-preparation-task/v1", id: randomUUID(), targetId, modId, status: "queued",
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), baseImageId: provenance.image!.id,
    expectedIdentity: { id: provenance.container!.id, startedAt: provenance.container!.startedAt, imageId: provenance.image!.id },
    sourceSha: mod.sha, managerSha: MOD_MANAGER_SHA, logs: ["准备任务已排队；不会切换推理实例。"] };
  await mkdir(path.join(root, "tasks"), { recursive: true, mode: 0o700 });
  const file = path.join(root, "tasks", task.id + ".json");
  await writeFile(file, JSON.stringify(task), { flag: "wx", mode: 0o600 });
  const worker = path.resolve(process.cwd(), "scripts/mod_runtime_worker.py");
  const child = spawn("/usr/bin/python3", [worker, root, task.id], { detached: true, stdio: ["pipe", "ignore", "ignore"],
    env: { PATH: "/usr/local/bin:/usr/bin:/bin", LANG: "C.UTF-8", PYTHONNOUSERSITE: "1", NODE_ENV: "production" } });
  child.on("error", () => { task.status = "failed"; task.logs.push("无法启动实例准备执行器。"); void writeFile(file, JSON.stringify(task)).catch(() => {}); });
  child.on("exit", code => {
    if (code === 0) return;
    // A confirmed child exit is not proof that its Docker daemon build stopped.
    // Preserve an unresolved state; never auto-retry based on age or timeout.
    void (async () => {
      const current = JSON.parse(await readFile(file, "utf8")) as PrivateTask;
      if (!["queued", "preparing"].includes(current.status)) return;
      current.status = "interrupted"; current.updatedAt = new Date().toISOString();
      current.logs.push("执行器异常退出，候选构建需先核查；不会自动重试。");
      await writeFile(file, JSON.stringify(current));
    })().catch(() => {});
  });
  child.stdin?.on("error", () => { /* The child records failures after launch; no credentials inherited. */ });
  child.stdin?.end(JSON.stringify({ target: config.target, library, mod, managerSha: MOD_MANAGER_SHA }));
  child.unref();
  return projectTask(task);
}
