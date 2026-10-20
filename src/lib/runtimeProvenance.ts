import { readFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const RECEIPT_SCHEMA = "vllm-hust.workstation-runtime-provenance/v2";
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

export interface RuntimeComponentProvenance {
  name: "vLLM-HUST" | "vLLM-Ascend-HUST";
  repository: string;
  commit: string;
  commitUrl: string;
  version: string;
}

export interface RuntimeProvenance {
  available: boolean;
  source: "docker-inspect-receipt" | "host-live-observation" | "unavailable";
  hostEvidence?: HostRuntimeEvidence;
  capturedAt?: string;
  reason?: string;
  container?: { name: string; id: string; startedAt: string };
  image?: { reference: string; id: string; digest: string; createdAt: string; digestKind?: "registry-manifest" | "image-config"; buildStartedAt?: string };
  runtimeLock?: { schema: string; sourceMode: string };
  compatibility?: {
    base: string;
    stableRelease: string;
    sourceProfile: string;
    vllmPackage: string;
    vllmAscendPackage: string;
  };
  components?: {
    core: RuntimeComponentProvenance;
    plugin: RuntimeComponentProvenance;
  };
  vllmHust: string;
  vllmAscendHust: string;
  artifactEvidence?: {
    core: { version: string; moduleOrigin: string; wheelSha256: string };
    plugin: { version: string; moduleOrigin: string; wheelSha256: string };
  };
  verification?: {
    status: "verified" | "stale" | "mismatch" | "unverified";
    checkedAt: string;
    receiptAgeSeconds: number;
    message: string;
    processSource: "not-attested";
  };
}

export interface HostRuntimeEvidence {
  schema: "vllm-hust.workstation-host-observation/v1";
  service: string;
  pid: number;
  startTicks: string;
  bootId: string;
  model: string;
  coveredModels: string[];
  startedAt: string;
  observedAt: string;
  version: string;
  repository: string;
  commit: string;
  commitUrl: string;
  sourceDigest: string;
  trackedAndNativeFiles: number;
  nativeArtifacts: number;
  dirty: false;
}

export function parseHostObservation(raw: string, expectedService: string, now = Date.now()): RuntimeProvenance {
  try {
    const host = JSON.parse(raw) as HostRuntimeEvidence;
    const age = (now - Date.parse(host.observedAt)) / 1000;
    if (host.schema !== "vllm-hust.workstation-host-observation/v1" || host.service !== expectedService ||
      !/^[A-Za-z0-9][A-Za-z0-9_.@-]*\.service$/.test(host.service) ||
      !Number.isSafeInteger(host.pid) || host.pid <= 1 || !/^\d+$/.test(host.startTicks) ||
      !/^[0-9a-f-]{36}$/.test(host.bootId) || !Number.isFinite(age) || age < -5 || age > 30 ||
      !Number.isFinite(Date.parse(host.startedAt)) || Date.parse(host.startedAt) > Date.parse(host.observedAt) ||
      !host.model || typeof host.version !== "string" || !host.version || host.dirty !== false ||
      !Array.isArray(host.coveredModels) || !host.coveredModels.length ||
      !host.coveredModels.every(model => typeof model === "string" && model.length > 0) ||
      host.repository !== "https://github.com/vLLM-HUST/vllm-hust" || !SHA_PATTERN.test(host.commit) ||
      host.commitUrl !== `${host.repository}/commit/${host.commit}` || !DIGEST_PATTERN.test(host.sourceDigest) ||
      !Number.isSafeInteger(host.trackedAndNativeFiles) || host.trackedAndNativeFiles < 1 ||
      !Number.isSafeInteger(host.nativeArtifacts) || host.nativeArtifacts < 1) {
      return unavailable("宿主运行来源观测无效、过期或与配置不一致");
    }
    return { available: true, source: "host-live-observation", hostEvidence: host,
      capturedAt: host.observedAt, vllmHust: host.commit, vllmAscendHust: "not-applicable",
      verification: { status: "verified", checkedAt: new Date(now).toISOString(), receiptAgeSeconds: Math.round(age),
        processSource: "not-attested",
        message: "已核对本机服务身份、监听端口、模型路由与启动前的干净源码/原生制品；这是磁盘与服务身份核验，不是进程内存证明，也不代表其他后端或 MOD 已验证。" } };
  } catch { return unavailable("宿主运行来源观测不是有效记录"); }
}

type Receipt = Omit<RuntimeProvenance, "available" | "source" | "reason" | "vllmHust" | "vllmAscendHust"> & {
  schema: string;
  source: "docker-inspect-receipt";
};

function unavailable(reason: string): RuntimeProvenance {
  return {
    available: false,
    source: "unavailable",
    reason,
    vllmHust: "unavailable",
    vllmAscendHust: "unavailable",
  };
}

function isCanonicalRepository(repository: string, expectedName: string): boolean {
  return repository === `https://github.com/vLLM-HUST/${expectedName}`;
}

export function parseRuntimeProvenance(raw: string): RuntimeProvenance {
  try {
    return parseReceipt(raw);
  } catch {
    return unavailable("运行来源 receipt 字段类型无效");
  }
}

function parseReceipt(raw: string): RuntimeProvenance {
  let receipt: Receipt;
  try {
    receipt = JSON.parse(raw) as Receipt;
  } catch {
    return unavailable("运行来源 receipt 不是有效 JSON");
  }

  if (receipt.schema !== RECEIPT_SCHEMA || receipt.source !== "docker-inspect-receipt") {
    return unavailable("运行来源 receipt schema 不受支持");
  }

  const { container, image, runtimeLock, compatibility, components, capturedAt } = receipt;
  if (!capturedAt || !container || !image || !runtimeLock || !compatibility || !components) {
    return unavailable("运行来源 receipt 字段不完整");
  }
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(container.name) ||
    !/^[0-9a-f]{64}$/.test(container.id) ||
    !Number.isFinite(Date.parse(capturedAt)) ||
    !Number.isFinite(Date.parse(container.startedAt)) ||
    !Number.isFinite(Date.parse(image.createdAt))
  ) return unavailable("运行来源身份或时间无效");
  if (!DIGEST_PATTERN.test(image.digest) || !DIGEST_PATTERN.test(image.id)) {
    return unavailable("运行镜像 digest 无效");
  }
  if (
    !image.createdAt ||
    !compatibility.base ||
    !compatibility.stableRelease ||
    !compatibility.sourceProfile ||
    !compatibility.vllmPackage ||
    !compatibility.vllmAscendPackage
  ) {
    return unavailable("运行镜像兼容基座信息不完整");
  }
  if (
    runtimeLock.schema !== "vllm-hust.production-runtime-lock/v2" ||
    runtimeLock.sourceMode !== "immutable-wheels"
  ) {
    return unavailable("运行来源没有可信 runtime lock");
  }
  if (!SHA_PATTERN.test(components.core.commit) || !SHA_PATTERN.test(components.plugin.commit)) {
    return unavailable("运行源码 commit 无效");
  }
  if (components.core.name !== "vLLM-HUST" || components.plugin.name !== "vLLM-Ascend-HUST") {
    return unavailable("运行组件名称与 receipt contract 不一致");
  }
  if (
    !isCanonicalRepository(components.core.repository, "vllm-hust") ||
    !isCanonicalRepository(components.plugin.repository, "vllm-ascend-hust")
  ) {
    return unavailable("运行源码仓库不是 canonical vLLM-HUST 仓库");
  }
  if (!components.core.version || !components.plugin.version) {
    return unavailable("运行源码版本信息不完整");
  }

  const expectedCoreUrl = `${components.core.repository}/commit/${components.core.commit}`;
  const expectedPluginUrl = `${components.plugin.repository}/commit/${components.plugin.commit}`;
  if (components.core.commitUrl !== expectedCoreUrl || components.plugin.commitUrl !== expectedPluginUrl) {
    return unavailable("运行源码 commit 链接与 receipt 不一致");
  }

  return {
    available: true,
    source: "docker-inspect-receipt",
    capturedAt,
    container,
    image,
    runtimeLock,
    compatibility,
    components,
    artifactEvidence: receipt.artifactEvidence,
    vllmHust: components.core.commit,
    vllmAscendHust: components.plugin.commit,
  };
}

export type ContainerIdentity = { id: string; image: string; startedAt: string; running: boolean };

export function verifyRuntimeProvenance(
  receipt: RuntimeProvenance,
  live: ContainerIdentity | null,
  now = Date.now(),
  maxAgeSeconds = 86400,
): RuntimeProvenance {
  if (!receipt.available) return receipt;
  const age = (now - Date.parse(receipt.capturedAt!)) / 1000;
  let status: NonNullable<RuntimeProvenance["verification"]>["status"] = "verified";
  let message = "当前容器身份与采集凭据一致；源码 SHA 来自镜像锁与安装制品，不是进程内存证明。";
  if (age < -300 || age > maxAgeSeconds) {
    status = "stale";
    message = "运行来源凭据已过期或时间异常，请重新采集；不代表当前运行状态。";
  } else if (!live) {
    status = "unverified";
    message = "无法核验当前容器身份；采集凭据不能作为实时运行证明。";
  } else if (!live.running || live.id !== receipt.container?.id || live.image !== receipt.image?.id || live.startedAt !== receipt.container?.startedAt) {
    status = "mismatch";
    message = "当前容器已停止或身份与采集凭据不一致，请重新采集。";
  } else if (!receipt.artifactEvidence ||
    receipt.artifactEvidence.core?.version !== receipt.compatibility?.vllmPackage ||
    receipt.artifactEvidence.plugin?.version !== receipt.compatibility?.vllmAscendPackage ||
    !/^[0-9a-f]{64}$/.test(receipt.artifactEvidence.core?.wheelSha256 || "") ||
    !/^[0-9a-f]{64}$/.test(receipt.artifactEvidence.plugin?.wheelSha256 || "") ||
    !receipt.artifactEvidence.core?.moduleOrigin?.includes("/site-packages/vllm/") ||
    !receipt.artifactEvidence.plugin?.moduleOrigin?.includes("/site-packages/vllm_ascend/")) {
    status = "unverified";
    message = "缺少容器内安装制品核验；镜像标签本身不是实际加载源码证明。";
  }
  return {
    ...receipt,
    available: status === "verified",
    reason: status === "verified" ? undefined : message,
    verification: { status, checkedAt: new Date(now).toISOString(), receiptAgeSeconds: Math.round(age), message, processSource: "not-attested" },
  };
}

const runFile = promisify(execFile);
let identityCache: { key: string; expires: number; value: Promise<ContainerIdentity | null> } | undefined;
let hostObservationCache: { key: string; expires: number; value: Promise<RuntimeProvenance> } | undefined;

async function inspectContainer(name: string): Promise<ContainerIdentity | null> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name)) return null;
  if (identityCache?.key === name && identityCache.expires > Date.now()) return identityCache.value;
  const value = (async () => {
    const args = ["inspect", "--type", "container", "--format", '{{json .Id}}|{{json .Image}}|{{json .State.StartedAt}}|{{json .State.Running}}', name];
    for (const [command, argv] of [["docker", args], ["sudo", ["-n", "docker", ...args]]] as const) {
      try {
        const { stdout } = await runFile(command, [...argv], { timeout: 3000, maxBuffer: 8192 });
        const [id, image, startedAt, running] = stdout.trim().split("|").map((field) => JSON.parse(field));
        return { id, image, startedAt, running } as ContainerIdentity;
      } catch { /* Fail closed if neither read-only inspection path is available. */ }
    }
    return null;
  })();
  identityCache = { key: name, expires: Date.now() + 15000, value };
  return value;
}

export function getRuntimeProvenancePath(): string {
  const configured = process.env.WORKSTATION_RUNTIME_PROVENANCE_FILE?.trim();
  if (configured) return path.resolve(configured);
  const deployHome = process.env.WORKSTATION_DEPLOY_HOME?.trim();
  return path.resolve(deployHome || path.join(process.cwd(), ".workstation-deploy"), "runtime-provenance.json");
}

export async function getRuntimeProvenance(): Promise<RuntimeProvenance> {
  const service = process.env.WORKSTATION_HOST_RUNTIME_SERVICE?.trim();
  if (service) {
    // Explicit host mode never falls back to an unrelated/stale Docker receipt.
    const routes = process.env.WORKSTATION_HOST_RUNTIME_ROUTES_FILE?.trim();
    if (!routes || !/^[A-Za-z0-9][A-Za-z0-9_.@-]*\.service$/.test(service)) return unavailable("宿主运行来源配置不完整");
    const key = JSON.stringify([service, path.resolve(routes)]);
    if (hostObservationCache?.key === key && hostObservationCache.expires > Date.now()) return hostObservationCache.value;
    const value = (async () => {
      try {
        const { stdout } = await runFile("python3", [path.join(process.cwd(), "scripts/inspect_host_runtime.py"),
          "--service", service, "--routes-file", path.resolve(routes)], { timeout: 12000, maxBuffer: 16384 });
        return parseHostObservation(stdout, service);
      } catch { return unavailable("宿主服务、源码、制品或路由实时核验失败；没有使用旧凭据兜底"); }
    })();
    // Bound fan-out from concurrent web clients; no stale-on-error reuse.
    hostObservationCache = { key, expires: Date.now() + 5000, value };
    return value;
  }
  try {
    const receipt = parseRuntimeProvenance(await readFile(getRuntimeProvenancePath(), "utf8"));
    if (!receipt.available) return receipt;
    const expected = process.env.WORKSTATION_RUNTIME_CONTAINER?.trim();
    if (expected && expected !== receipt.container?.name) return unavailable("采集容器与当前部署配置不一致");
    return verifyRuntimeProvenance(receipt, await inspectContainer(expected || receipt.container!.name));
  } catch {
    return unavailable("尚未生成可信运行来源 receipt");
  }
}
