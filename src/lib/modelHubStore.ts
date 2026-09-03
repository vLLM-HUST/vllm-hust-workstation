import fsp from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { MODEL_CATALOG, getModelHubDir, idleDownloadState } from "@/lib/modelHub";
import type { ModelHubCatalog, ModelHubDownloadState } from "@/types";

type RuntimeDownload = {
  state: ModelHubDownloadState;
  process?: ChildProcessWithoutNullStreams;
  timer?: NodeJS.Timeout;
  killTimer?: NodeJS.Timeout;
};
type Store = { downloads: Record<string, RuntimeDownload>; preparing?: boolean };
const globalStore = globalThis as typeof globalThis & { __vllmHustModelHubStore?: Store };
function getStore(): Store {
  return globalStore.__vllmHustModelHubStore ??= { downloads: {} };
}

async function dirSize(dir: string): Promise<number> {
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    const sizes = await Promise.all(entries.map(async entry => {
      if (entry.isSymbolicLink() || entry.name.endsWith(".lock")) return 0;
      const child = path.join(dir, entry.name);
      return entry.isDirectory() ? dirSize(child) : (await fsp.stat(child)).size;
    }));
    return sizes.reduce((sum, size) => sum + size, 0);
  } catch { return 0; }
}

/** Check every indexed shard, not merely the presence of the first weight file. */
export async function hasCompleteWeights(dir: string): Promise<boolean> {
  try {
    if ((await fsp.lstat(dir)).isSymbolicLink()) return false;
    JSON.parse(await fsp.readFile(path.join(dir, "config.json"), "utf8"));
    const names = await fsp.readdir(dir);
    const index = ["model.safetensors.index.json", "pytorch_model.bin.index.json"].find(name => names.includes(name));
    let files: string[];
    if (index) {
      const data = JSON.parse(await fsp.readFile(path.join(dir, index), "utf8"));
      files = [...new Set(Object.values(data.weight_map || {}))] as string[];
    } else {
      files = ["model.safetensors", "pytorch_model.bin"].filter(name => names.includes(name));
    }
    if (!files.length) return false;
    for (const file of files) {
      if (typeof file !== "string" || path.basename(file) !== file || !/\.(safetensors|bin)$/.test(file)) return false;
      const stat = await fsp.lstat(path.join(dir, file));
      if (!stat.isFile() || stat.size === 0) return false;
    }
    return true;
  } catch { return false; }
}

export async function getModelStorage(): Promise<ModelHubCatalog["storage"]> {
  const dir = getModelHubDir();
  if (!dir) return { configured: false, available: false, message: "尚未配置模型存储，下载已禁用。" };
  try {
    if (!(await fsp.stat(dir)).isDirectory()) throw new Error("Not a directory");
    await fsp.access(dir, constants.W_OK);
    const stat = await fsp.statfs(dir);
    return { configured: true, available: true, path: dir, freeBytes: stat.bavail * stat.bsize, message: "专用模型存储已配置；下载前会检查空间。" };
  } catch {
    return { configured: true, available: false, path: dir, message: "模型存储不可用，请管理员检查目录和写入权限。" };
  }
}

export async function getCatalog(administrator = false): Promise<ModelHubCatalog> {
  const storage = await getModelStorage();
  const dir = getModelHubDir();
  const catalog = await Promise.all(MODEL_CATALOG.map(async item => {
    const runtime = getStore().downloads[item.id];
    const busy = Boolean(runtime?.process || runtime?.state.status === "downloading");
    const installed = Boolean(!busy && dir && storage.available && await hasCompleteWeights(path.join(dir, item.id)));
    const download: ModelHubDownloadState = installed ? { status: "done", pct: 100 } : { ...(runtime?.state ?? idleDownloadState()) };
    if (!administrator) {
      delete download.currentFile;
      if (download.error) download.error = "下载失败，请联系管理员。";
    }
    return { ...item, installed, download };
  }));
  return {
    catalog,
    permissions: { administrator, canDownload: administrator && storage.available, canActivate: false },
    storage: administrator ? storage : { configured: storage.configured, available: storage.available, message: "模型目录仅供浏览；下载与部署由管理员管理。" },
  };
}

export function cancelDownload(modelId: string): boolean {
  const runtime = getStore().downloads[modelId];
  if (!runtime?.process || runtime.state.status !== "downloading") return false;
  runtime.process.kill("SIGTERM");
  runtime.state = { ...runtime.state, status: "cancelled", currentFile: "正在取消；已下载文件保留" };
  runtime.killTimer = setTimeout(() => runtime.process?.kill("SIGKILL"), 5000);
  runtime.killTimer.unref();
  return true;
}

type DownloadResult = { ok: boolean; message: string; status: number };
const fail = (status: number, message: string): DownloadResult => ({ ok: false, message, status });

export async function startDownload(modelId: string): Promise<DownloadResult> {
  const model = MODEL_CATALOG.find(item => item.id === modelId);
  if (!model) return fail(404, "模型不在允许下载的目录中。");
  const store = getStore();
  // Serialize preflight too: concurrent requests cannot both reserve the same space.
  if (store.preparing || Object.values(store.downloads).some(job => job.process)) return fail(409, "已有下载任务，请等待完成或取消后再试。");
  store.preparing = true;
  try {
    const storage = await getModelStorage();
    if (!storage.available || !storage.path) return fail(503, storage.message);
    const required = Math.ceil(model.sizeGb * 1e9 * 1.1) + 5 * 1024 ** 3;
    if ((storage.freeBytes ?? 0) < required) return fail(507, "存储空间不足：需要模型预估大小、10% 余量及 5 GiB 保留空间。");
    if (model.requiresAuth && !process.env.HF_TOKEN) return fail(503, "此模型需要管理员配置 Hugging Face 授权。");
    const target = path.join(storage.path, model.id);
    await fsp.mkdir(target, { recursive: true });
    if ((await fsp.lstat(target)).isSymbolicLink()) return fail(409, "拒绝写入符号链接模型目录。");
    if (await hasCompleteWeights(target)) return { ok: true, status: 200, message: "权重已下载；部署由平台管理。" };
    const job: RuntimeDownload = { state: { status: "downloading", pct: 0, totalBytes: Math.round(model.sizeGb * 1e9), currentFile: "正在连接模型仓库" } };
    store.downloads[modelId] = job;
    const env: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV || "production", HF_HUB_DISABLE_PROGRESS_BARS: "1" };
    for (const key of ["PATH", "HOME", "HF_TOKEN", "HF_ENDPOINT", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "SSL_CERT_FILE", "REQUESTS_CA_BUNDLE"]) {
      if (process.env[key]) env[key] = process.env[key];
    }
    const child = spawn("python3", ["-c", "import os,sys\nfrom huggingface_hub import snapshot_download\nsnapshot_download(repo_id=sys.argv[1], local_dir=sys.argv[2], token=os.environ.get('HF_TOKEN') or None)", model.repoId, target], { env });
    job.process = child;
    child.stdout.resume();
    let stderr = "";
    child.stderr.on("data", chunk => { stderr = (stderr + chunk.toString()).slice(-8000); });
    job.timer = setInterval(() => { void dirSize(target).then(bytes => {
      if (job.state.status !== "downloading") return;
      job.state.downloadedBytes = bytes;
      job.state.pct = Math.min(99, Math.floor(bytes / (job.state.totalBytes || 1) * 100));
    }); }, 5000);
    job.timer.unref();
    const cleanup = () => { clearInterval(job.timer); clearTimeout(job.killTimer); job.process = undefined; };
    child.on("error", () => {
      cleanup();
      job.state = { ...job.state, status: "error", error: "无法启动下载程序，请管理员检查 Python / huggingface_hub。" };
    });
    child.on("close", async (code, signal) => {
      const cancelled = job.state.status === "cancelled" || Boolean(signal);
      const complete = !cancelled && code === 0 && await hasCompleteWeights(target);
      cleanup();
      job.state = { ...job.state, status: cancelled ? "cancelled" : complete ? "done" : "error", pct: complete ? 100 : job.state.pct };
      if (!cancelled && !complete) {
        const token = process.env.HF_TOKEN;
        job.state.error = code === 0 ? "下载程序退出，但权重分片检查未通过。" : (token ? stderr.split(token).join("[redacted]") : stderr).trim() || "下载失败，请检查下载依赖、网络和仓库权限。";
      }
    });
    return { ok: true, status: 202, message: "下载任务已提交；完成后仍需平台部署，不会切换当前推理模型。" };
  } catch {
    return fail(503, "下载启动失败，请检查模型存储与下载程序。");
  } finally { store.preparing = false; }
}
