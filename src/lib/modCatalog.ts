/** Reviewed snapshot of the official registry, not a remote executable feed. */
export const MOD_CATALOG_SOURCE = "https://vllm-hust.sage.org.ai/plugins.html";
export const MOD_MANAGER_SHA = "9fb467447e95d753f7002b28575d6802f4347181";
export const MOD_MANAGER_CANDIDATE_SHA = "6e9a477f30b3399dda06733de03a78814dc28ca6";
export interface ArtifactQualification {
  status: "passed" | "not-applicable" | "external";
  label: string;
  scope: string;
  evidence?: string;
}
export interface EffectivenessQualification {
  status: "not-beneficial-in-tested-cell" | "inconclusive" | "beneficial" | "not-applicable" | "unqualified";
  label: string;
  scope: string;
}
// `compatibility` records the pinned source's historical declaration, not a
// verdict about the selected instance. Requalify exact artifacts before updating
// that declaration; neither a version mismatch nor preparation proves runtime fit.
export const MOD_CATALOG = [
  { id: "bidkv", name: "BidKV", kind: "推理扩展", description: "KV 压力下的效用感知抢占策略。", repository: "https://github.com/vLLM-HUST/vllm-hust-bidkv", sha: "ba700cb69ed5c84f012e5103eb115aa22cdbc1f5", candidateSha: "199e0bdc6fc38fc9b14b626515efdcbf81de0b62", candidateManagerSha: MOD_MANAGER_CANDIDATE_SHA, candidateStatus: "current-main-tp4-graph-functional-compatible-cell-scoped-effectiveness", artifactQualification: { status: "passed", label: "功能兼容性已通过", scope: "Qwen3.8-27B · Core a4d6aa02 / Ascend 2c8c7221 · Ascend TP4 FULL_DECODE_ONLY graph", evidence: "docs/evidence/sage-mate-20260905-bounded-preemption-matrix.md" }, effectivenessQualification: { status: "not-beneficial-in-tested-cell", label: "已测交互单元不具收益", scope: "interactive · concurrency=8 · 1-GiB KV pressure · n=3；吞吐 -25.31%，P95 +34.57%；ascending mixed 另为 inconclusive" }, qualifiedModels: ["Qwen3.8-27B · Ascend TP4 FULL_DECODE_ONLY graph · 功能兼容性已通过"], bundle: "org.vllm-hust.bidkv", package: "bidkv", compatibility: "Qwen3.8-27B：Core a4d6aa02 · Ascend 2c8c7221 · TP4 graph · 功能兼容性已通过", requirements: "选择器调用、四 rank graph、输出、取消和恢复门槛通过，0 policy failure/invalid selection。ascending mixed 因一轮未触发而 inconclusive；interactive c=8 稳定触发但该单元无收益。" },
  { id: "diffspec", name: "DiffSpec", kind: "推理扩展", description: "面向长序列的差分推测解码。", repository: "https://github.com/vLLM-HUST/vllm-ascend-hust-diffspec", sha: "762959978514cdd01407b58f1015a75f2ae2c936", candidateSha: "c78f55c7e4923da342f2fc52c2cb509c150e5363", qualificationMetadataSha: "998697897c0f854dc0fda8f0f28f07670196c411", candidateManagerSha: MOD_MANAGER_CANDIDATE_SHA, candidateStatus: "tp4-graph-functional-qualified-performance-degraded-published", artifactQualification: { status: "passed", label: "功能兼容性已通过", scope: "Qwen3.8-27B + VirVen/Qwen3.5-27B-EAGLE3-v2 · TP4 FULL_DECODE_ONLY graph" }, effectivenessQualification: { status: "not-beneficial-in-tested-cell", label: "已测单元不具收益", scope: "已测 Eagle3 配置：接受率 19.29%，吞吐低于 target-only" }, qualifiedModels: ["Qwen3.8-27B · TP4 FULL_DECODE_ONLY graph · 功能已验证、已测配置性能退化"], requiredDraftModels: ["VirVen/Qwen3.5-27B-EAGLE3-v2 · SHA256 a57cefc4…"], bundle: "org.vllm-hust.diffspec", package: "vllm-diffspec", compatibility: "Qwen3.8-27B：Core 762f85b3 · Ascend 4e57439e · TP4 graph · 功能已验证", requirements: "候选接受率 19.29%，已测配置吞吐低于 target-only，不构成加速推荐；当前实例状态须由 live witness 单独判定。" },
  { id: "latchmoe", name: "LatchMoE", kind: "推理扩展", description: "保持地址稳定、兼容计算图的 MoE 专家卸载。", repository: "https://github.com/vLLM-HUST/vllm-ascend-hust-LatchMoE", sha: "53675b58a93b8cc455dba6bb630bfd8bef55a134", candidateSha: "63781f3dd0235f933735bfd8ce614d388093c0b5", candidateManagerSha: MOD_MANAGER_CANDIDATE_SHA, candidateStatus: "tp4-graph-functional-qualified-performance-degraded-published", artifactQualification: { status: "passed", label: "MoE 功能兼容性已通过", scope: "Qwen3-30B-A3B · TP4 PIECEWISE graph；Qwen3.8-27B 为 dense，不适用" }, effectivenessQualification: { status: "not-beneficial-in-tested-cell", label: "已测单元不具收益", scope: "Qwen3-30B-A3B 已测配置性能退化" }, qualifiedModels: ["Qwen3-30B-A3B · TP4 PIECEWISE graph · 功能已验证、已测配置性能退化"], notApplicableModels: ["Qwen3.8-27B · dense、无 routed experts"], historicalModels: ["GLM-4.7-Flash · 单 NPU 历史通道", "Qwen3-Next-80B-A3B-Instruct · 单 NPU 历史通道"], bundle: "org.vllm-hust.latchmoe", package: "vllm-moe-offload-ascend", compatibility: "Qwen3.8-27B：不适用；Qwen3-30B-A3B TP4 graph：功能已验证", requirements: "已验证 expert mapping、主机/设备换入换出、graph 地址稳定、并发、取消与异常恢复；已测配置不构成加速推荐。" },
  { id: "pegaflow", name: "PegaFlow", kind: "外部服务", description: "独立的 KV 存储、传输与元数据系统。", repository: "https://github.com/vLLM-HUST/pegaflow-hust", sha: "", bundle: "", package: "", artifactQualification: { status: "external", label: "外部服务", scope: "由外部服务运维方管理" }, effectivenessQualification: { status: "unqualified", label: "未在工作站验收", scope: "不由 Workstation 生命周期管理" }, compatibility: "由外部服务运维方管理", requirements: "Provider 只生成连接配置和健康检查；工作站不启停服务，不删除 KV 数据。" },
] as const;

export type ModId = typeof MOD_CATALOG[number]["id"];
export type ModAction = "install" | "configure" | "enable" | "disable" | "uninstall" | "run";
export interface ModState { installed: boolean; enabled: boolean; configured: boolean; runtimeEffective: boolean | null; version?: string; sha?: string; installedAt?: string }
export interface ModTask { id: string; modId: string; action: string; status: "queued" | "running" | "succeeded" | "failed" | "interrupted"; createdAt: string; updatedAt: string; logs: string[] }
export interface ModCatalogPayload {
  catalog: Array<typeof MOD_CATALOG[number] & {
    currentRuntimeState: ModState;
    stateError?: string;
    currentRuntimeCompatibility: import("./modCompatibility").CurrentRuntimeCompatibility;
  }>;
  administrator: boolean;
  storageReady: boolean;
  tasks: ModTask[];
  runtime: { status: "unverified"; message: string };
}
