/** Reviewed snapshot of the official registry, not a remote executable feed. */
export const MOD_CATALOG_SOURCE = "https://vllm-hust.sage.org.ai/plugins.html";
export const MOD_MANAGER_SHA = "9fb467447e95d753f7002b28575d6802f4347181";
export const MOD_MANAGER_CANDIDATE_SHA = "24036c11c894c3fe0736e59efd17159c5e307783";
// `compatibility` records the pinned source's historical declaration, not a
// verdict about the selected instance. Requalify exact artifacts before updating
// that declaration; neither a version mismatch nor preparation proves runtime fit.
export const MOD_CATALOG = [
  { id: "bidkv", name: "BidKV", kind: "推理扩展", description: "KV 压力下的效用感知抢占策略。", repository: "https://github.com/vLLM-HUST/vllm-hust-bidkv", sha: "6007abbd667502367eabe981604c2e5216085202", candidateSha: "463f798b209a33ff2d2f4e277b9aedb26d75fa29", candidateManagerSha: MOD_MANAGER_CANDIDATE_SHA, candidateStatus: "tp4-graph-qualified-pending-human-review", qualifiedModels: ["Qwen3.8-27B · TP4 graph · verified"], bundle: "org.vllm-hust.bidkv", package: "bidkv", compatibility: "Qwen3.8-27B：Core 762f85b3 · Ascend 4e57439e · TP4 graph · 已验证", requirements: "候选制品已通过真实 KV 压力、策略调用、输出与回滚门禁；当前实例仍需证明安装的正是该制品且 runtime effective。" },
  { id: "diffspec", name: "DiffSpec", kind: "推理扩展", description: "面向长序列的差分推测解码。", repository: "https://github.com/vLLM-HUST/vllm-ascend-hust-diffspec", sha: "762959978514cdd01407b58f1015a75f2ae2c936", candidateSha: "96188b9923928b3d51bbf7f81d38fcd1144e3fb9", candidateManagerSha: MOD_MANAGER_CANDIDATE_SHA, candidateStatus: "blocked-no-compatible-eagle3-draft", qualifiedModels: [] as readonly string[], blockedModels: ["Qwen3.8-27B · 缺少兼容 Eagle3 draft"], bundle: "org.vllm-hust.diffspec", package: "vllm-diffspec", compatibility: "Core 762f85b3 · Ascend 4e57439e · TP4 graph 目标 · 未兼容", requirements: "缺少与 Qwen3.8 vocab、tokenizer 和架构匹配的 Eagle3 draft；不得以改版本声明或 eager/TP1 回退代替验证。" },
  { id: "latchmoe", name: "LatchMoE", kind: "推理扩展", description: "保持地址稳定、兼容计算图的 MoE 专家卸载。", repository: "https://github.com/vLLM-HUST/vllm-ascend-hust-LatchMoE", sha: "53675b58a93b8cc455dba6bb630bfd8bef55a134", candidateSha: "63781f3dd0235f933735bfd8ce614d388093c0b5", candidateManagerSha: MOD_MANAGER_CANDIDATE_SHA, candidateStatus: "tp4-graph-functional-qualified-performance-degraded-pending-human-review", qualifiedModels: ["Qwen3-30B-A3B · TP4 PIECEWISE graph · 功能已验证、性能退化"], notApplicableModels: ["Qwen3.8-27B · dense、无 routed experts"], historicalModels: ["GLM-4.7-Flash · 单 NPU 历史通道", "Qwen3-Next-80B-A3B-Instruct · 单 NPU 历史通道"], bundle: "org.vllm-hust.latchmoe", package: "vllm-moe-offload-ascend", compatibility: "Qwen3.8-27B：不适用；Qwen3-30B-A3B TP4 graph：功能已验证、性能明显退化", requirements: "已验证 expert mapping、主机/设备换入换出、graph 地址稳定、并发、取消与异常恢复；不构成加速或生产推荐。" },
  { id: "pegaflow", name: "PegaFlow", kind: "外部服务", description: "独立的 KV 存储、传输与元数据系统。", repository: "https://github.com/vLLM-HUST/pegaflow-hust", sha: "", bundle: "", package: "", compatibility: "由外部服务运维方管理", requirements: "Provider 只生成连接配置和健康检查；工作站不启停服务，不删除 KV 数据。" },
] as const;

export type ModId = typeof MOD_CATALOG[number]["id"];
export type ModAction = "install" | "configure" | "enable" | "disable" | "uninstall" | "run";
export interface ModState { installed: boolean; enabled: boolean; configured: boolean; runtimeEffective: boolean | null; version?: string; sha?: string; installedAt?: string }
export interface ModTask { id: string; modId: string; action: string; status: "queued" | "running" | "succeeded" | "failed" | "interrupted"; createdAt: string; updatedAt: string; logs: string[] }
export interface ModCatalogPayload {
  catalog: Array<typeof MOD_CATALOG[number] & {
    state: ModState;
    stateError?: string;
    currentCompatibility: import("./modCompatibility").CurrentModCompatibility;
    /** @deprecated Use currentCompatibility. Derived from the same server assessment. */
    qualification: import("./modCompatibility").ModCompatibilityAssessment;
  }>;
  administrator: boolean;
  storageReady: boolean;
  tasks: ModTask[];
  runtime: { status: "unverified"; message: string };
}
