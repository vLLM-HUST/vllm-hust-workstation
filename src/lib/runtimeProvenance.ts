import { readFile } from "node:fs/promises";
import path from "node:path";

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
  source: "docker-inspect-receipt" | "unavailable";
  capturedAt?: string;
  reason?: string;
  container?: { name: string; id: string; startedAt: string };
  image?: { reference: string; id: string; digest: string; createdAt: string };
  runtimeLock?: { schema: string; sourceMode: string };
  compatibility?: { base: string; vllmPackage: string; vllmAscendPackage: string };
  components?: {
    core: RuntimeComponentProvenance;
    plugin: RuntimeComponentProvenance;
  };
  vllmHust: string;
  vllmAscendHust: string;
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
  if (!DIGEST_PATTERN.test(image.digest) || !DIGEST_PATTERN.test(image.id)) {
    return unavailable("运行镜像 digest 无效");
  }
  if (!image.createdAt || !compatibility.base || !compatibility.vllmPackage || !compatibility.vllmAscendPackage) {
    return unavailable("运行镜像兼容基座信息不完整");
  }
  if (
    runtimeLock.schema !== "vllm-hust.production-runtime-lock/v1" ||
    !runtimeLock.sourceMode
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
    vllmHust: components.core.commit,
    vllmAscendHust: components.plugin.commit,
  };
}

export function getRuntimeProvenancePath(): string {
  const configured = process.env.WORKSTATION_RUNTIME_PROVENANCE_FILE?.trim();
  if (configured) return path.resolve(configured);
  const deployHome = process.env.WORKSTATION_DEPLOY_HOME?.trim();
  return path.resolve(deployHome || path.join(process.cwd(), ".workstation-deploy"), "runtime-provenance.json");
}

export async function getRuntimeProvenance(): Promise<RuntimeProvenance> {
  try {
    return parseRuntimeProvenance(await readFile(getRuntimeProvenancePath(), "utf8"));
  } catch {
    return unavailable("尚未生成可信运行来源 receipt");
  }
}
