import { access, lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { MOD_CATALOG, MOD_MANAGER_SHA, type ModAction, type ModCatalogPayload, type ModState, type ModTask } from "./modCatalog";

export class ModError extends Error { constructor(message: string, public status = 409) { super(message); } }

export async function modRoot(): Promise<string> {
  const root = process.env.WORKSTATION_MOD_DIR?.trim();
  if (!root || !path.isAbsolute(root) || path.resolve(root) === "/") throw new ModError("Mod 存储未配置，请配置独立的 WORKSTATION_MOD_DIR。", 503);
  const info = await lstat(root);
  if (!info.isDirectory() || info.isSymbolicLink() || await realpath(root) !== path.resolve(root)) throw new ModError("Mod 存储必须为真实独立目录。", 503);
  await access(root, 6);
  return root;
}

async function tasks(root: string): Promise<ModTask[]> {
  const dir = path.join(root, "tasks");
  let names: string[];
  try { names = await readdir(dir); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const results = await Promise.all(names.filter(n => /^[a-f0-9-]{36}\.json$/.test(n)).map(async n => {
    const task = JSON.parse(await readFile(path.join(dir, n), "utf8")) as ModTask;
    if (["queued", "running"].includes(task.status) && Date.now() - Date.parse(task.createdAt) > 20 * 60_000) {
      task.status = "interrupted";
      task.logs = [...task.logs, "任务超时或执行器已退出，请检查后重试。"];
    }
    return task;
  }));
  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getModCatalog(administrator: boolean): Promise<ModCatalogPayload> {
  let root: string | undefined;
  try { root = await modRoot(); } catch { /* Fail closed; catalog remains browsable. */ }
  const catalog = await Promise.all(MOD_CATALOG.map(async mod => {
    let state: ModState = { installed: false, configured: false, enabled: false };
    let stateError: string | undefined;
    if (root && mod.sha) {
      try {
        const target = path.join(root, mod.id);
        if ((await lstat(target)).isSymbolicLink()) throw new Error("symlink");
        const receipt = JSON.parse(await readFile(path.join(target, "receipt.json"), "utf8"));
        state = { installed: receipt.installed, enabled: receipt.enabled, configured: receipt.configured, version: receipt.version, sha: receipt.sha, installedAt: receipt.installedAt };
        if (state.sha !== mod.sha || typeof state.installed !== "boolean" || typeof state.enabled !== "boolean" || typeof state.configured !== "boolean") throw new Error("receipt");
        await access(path.join(target, "env/bin/python"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") stateError = "安装凭据无效，需管理员检查。";
        else if (state.installed) stateError = "安装环境缺失，需管理员检查。";
        state = { installed: false, configured: false, enabled: false };
      }
    }
    return { ...mod, state, stateError };
  }));
  return { catalog, administrator, storageReady: Boolean(root), tasks: root && administrator ? (await tasks(root)).slice(0, 20) : [], runtime: { status: "unverified", message: "尚未绑定可管理的推理实例。安装和启用意图仅保存在 Mod 库；不代表当前共享服务已加载。运行需目标版本、资源与重启审批。" } };
}

export async function startModAction(id: string, action: ModAction, configuration?: unknown): Promise<ModTask> {
  const mod = MOD_CATALOG.find(m => m.id === id);
  if (!mod) throw new ModError("未知 Mod。", 404);
  if (!["install", "configure", "enable", "disable", "uninstall", "run"].includes(action)) throw new ModError("不支持的操作。", 400);
  if (action === "run") throw new ModError("未绑定经兼容性验收的专属推理实例；本操作不会重启共享服务。需要单独的部署与重启审批。");
  if (!mod.sha) throw new ModError("外部服务不由工作站安装、启停或卸载。");
  if (action === "configure" && (!configuration || typeof configuration !== "object" || Array.isArray(configuration) || JSON.stringify(configuration).length > 16_384)) throw new ModError("配置必须为不超过 16 KiB 的 JSON 对象。", 400);
  const root = await modRoot();
  if ((await tasks(root)).some(t => ["running", "queued"].includes(t.status))) throw new ModError("已有 Mod 任务正在执行，请等待完成。");
  const worker = path.resolve(process.env.WORKSTATION_MOD_WORKER || path.join(process.cwd(), "scripts/mod_worker.py"));
  await access(worker);
  const task: ModTask = { id: randomUUID(), modId: id, action, status: "queued", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), logs: ["任务已排队；仅操作独立 Mod 库。"] };
  await mkdir(path.join(root, "tasks"), { recursive: true, mode: 0o700 });
  const file = path.join(root, "tasks", `${task.id}.json`);
  await writeFile(file, JSON.stringify(task), { flag: "wx", mode: 0o600 });
  // Credentials, Python paths, pip config and serving environment are not inherited.
  const child = spawn(process.env.WORKSTATION_MOD_PYTHON || "/usr/bin/python3", [worker, root, task.id], { stdio: ["pipe", "ignore", "ignore"], env: { PATH: "/usr/local/bin:/usr/bin:/bin", LANG: "C.UTF-8", NODE_ENV: "production" }, detached: true });
  const fail = async () => { task.status = "failed"; task.logs.push("无法启动 Mod 执行器。"); await writeFile(file, JSON.stringify(task)); };
  child.on("error", () => { void fail(); });
  child.stdin?.on("error", () => { /* Spawn error handler records the failure. */ });
  child.stdin?.end(JSON.stringify({ mod, managerSha: MOD_MANAGER_SHA, configuration: configuration ?? {} }));
  child.unref();
  return task;
}
