import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";

export const runtime = "nodejs";
export const revalidate = 0;

function exec(cmd: string, args: string[], timeoutMs = 5000): Promise<string> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs }, (err, stdout) => {
      resolve(err ? "" : stdout);
    });
  });
}

async function getNpuInfo(): Promise<string> {
  // Try npu-smi (Ascend)
  const npuOut = await exec("npu-smi", ["info"]);
  if (npuOut) {
    const names: string[] = [];
    for (const line of npuOut.split("\n")) {
      const parts = line.split("|");
      if (parts.length < 3) continue;
      const tokens = parts[1].trim().split(/\s+/);
      if (tokens.length === 2 && /^\d+$/.test(tokens[0]) && !/^\d+$/.test(tokens[1])) {
        names.push(tokens[1]);
      }
    }
    if (names.length > 0) {
      const unique = [...new Set(names)];
      return unique.length === 1
        ? `${names.length}\u00d7 ${unique[0]}`
        : `${names.length}\u00d7 ${unique.join(",")}`;
    }
  }

  // Try nvidia-smi (NVIDIA GPU)
  const nvOut = await exec("nvidia-smi", [
    "--query-gpu=gpu_name",
    "--format=csv,noheader",
  ]);
  if (nvOut.trim()) {
    const names = nvOut.trim().split("\n").map((l) => l.trim()).filter(Boolean);
    const unique = [...new Set(names)];
    return unique.length === 1
      ? `${names.length}\u00d7 ${unique[0]}`
      : `${names.length}\u00d7 ${unique.join(",")}`;
  }

  return "";
}

async function getCpuInfo(): Promise<string> {
  // lscpu works on both x86 and ARM
  const out = await exec("lscpu", []);
  if (out) {
    let model = "";
    let cores = 0;
    for (const line of out.split("\n")) {
      if (line.startsWith("Model name:")) model = line.split(":")[1].trim().split("@")[0].trim();
      if (line.startsWith("CPU(s):") && !line.startsWith("CPU(s) list")) cores = parseInt(line.split(":")[1].trim(), 10) || 0;
    }
    if (model) return cores ? `${model} \u00b7 ${cores} cores` : model;
  }

  // Fallback: /proc/cpuinfo
  try {
    const text = await readFile("/proc/cpuinfo", "utf-8");
    const modelLine = text.split("\n").find((l) => l.startsWith("model name"));
    const model = modelLine?.split(":")[1]?.trim().split("@")[0].trim() ?? "";
    const cores = (text.match(/processor\t:/g) ?? []).length;
    if (model) return `${model} \u00b7 ${cores} cores`;
  } catch {
    // ignore
  }
  return "";
}

async function getMemoryInfo(): Promise<string> {
  try {
    const text = await readFile("/proc/meminfo", "utf-8");
    const line = text.split("\n").find((l) => l.startsWith("MemTotal:"));
    if (line) {
      const kb = parseInt(line.split(/\s+/)[1], 10);
      const gib = kb / (1024 * 1024);
      return gib >= 1024 ? `${(gib / 1024).toFixed(1)} TiB` : `${Math.round(gib)} GiB`;
    }
  } catch {
    // ignore
  }
  return "";
}

export async function GET() {
  const [npu, cpu, memory] = await Promise.all([
    getNpuInfo(),
    getCpuInfo(),
    getMemoryInfo(),
  ]);

  return Response.json({ npu, cpu, memory });
}
