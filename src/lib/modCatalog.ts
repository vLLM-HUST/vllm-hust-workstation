/** Reviewed snapshot of the official registry, not a remote executable feed. */
export const MOD_CATALOG_SOURCE = "https://vllm-hust.sage.org.ai/plugins.html";
export const MOD_MANAGER_SHA = "9fb467447e95d753f7002b28575d6802f4347181";
export const MOD_MANAGER_CANDIDATE_SHA = "6e9a477f30b3399dda06733de03a78814dc28ca6";
// `compatibility` records the pinned source's historical declaration, not a
// verdict about the selected instance. Requalify exact artifacts before updating
// that declaration; neither a version mismatch nor preparation proves runtime fit.
export const MOD_CATALOG = [
  { id: "bidkv", name: "BidKV", kind: "推理扩展", description: "KV 压力下的效用感知抢占策略。", repository: "https://github.com/vLLM-HUST/vllm-hust-bidkv", sha: "024194b3ed4ffcedcc8ecc21a8fe0573924e7494", candidateSha: "1462a17b3b5e59865957d7a2226fb2f0578eecb1", candidateManagerSha: MOD_MANAGER_CANDIDATE_SHA, candidateStatus: "current-main-tp4-graph-compatible-runtime-effective-performance-neutral", qualifiedModels: ["Qwen3.8-27B · Ascend TP4 FULL_DECODE_ONLY graph · runtime effective、性能中性"], bundle: "org.vllm-hust.bidkv", package: "bidkv", compatibility: "Qwen3.8-27B：Core a4d6aa02 · Ascend 2c8c7221 · TP4 graph · 已通过", requirements: "3×真实 A/B 均为 161 次抢占且无额外 prompt 重算；483 次有效选择、0 失败；短输出精确一致，取消后 1 秒排空。吞吐均值 +1.23% 但 95% 区间重叠，不宣称加速。" },
  { id: "diffspec", name: "DiffSpec", kind: "推理扩展", description: "面向长序列的差分推测解码。", repository: "https://github.com/vLLM-HUST/vllm-ascend-hust-diffspec", sha: "762959978514cdd01407b58f1015a75f2ae2c936", candidateSha: "c78f55c7e4923da342f2fc52c2cb509c150e5363", qualificationMetadataSha: "998697897c0f854dc0fda8f0f28f07670196c411", candidateManagerSha: MOD_MANAGER_CANDIDATE_SHA, candidateStatus: "tp4-graph-functional-qualified-performance-degraded-published", qualifiedModels: ["Qwen3.8-27B · TP4 FULL_DECODE_ONLY graph · 功能已验证、性能退化"], requiredDraftModels: ["VirVen/Qwen3.5-27B-EAGLE3-v2 · SHA256 a57cefc4…"], bundle: "org.vllm-hust.diffspec", package: "vllm-diffspec", compatibility: "Qwen3.8-27B：Core 762f85b3 · Ascend 4e57439e · TP4 graph · 功能已验证、性能退化", requirements: "候选接受率 19.29%，吞吐低于 target-only，不构成加速推荐；当前实例仍需精确制品、draft 哈希、四 rank ACLGraph 和计数器见证才能标记 runtime effective。" },
  { id: "latchmoe", name: "LatchMoE", kind: "推理扩展", description: "保持地址稳定、兼容计算图的 MoE 专家卸载。", repository: "https://github.com/vLLM-HUST/vllm-ascend-hust-LatchMoE", sha: "53675b58a93b8cc455dba6bb630bfd8bef55a134", candidateSha: "63781f3dd0235f933735bfd8ce614d388093c0b5", candidateManagerSha: MOD_MANAGER_CANDIDATE_SHA, candidateStatus: "tp4-graph-functional-qualified-performance-degraded-published", qualifiedModels: ["Qwen3-30B-A3B · TP4 PIECEWISE graph · 功能已验证、性能退化"], notApplicableModels: ["Qwen3.8-27B · dense、无 routed experts"], historicalModels: ["GLM-4.7-Flash · 单 NPU 历史通道", "Qwen3-Next-80B-A3B-Instruct · 单 NPU 历史通道"], bundle: "org.vllm-hust.latchmoe", package: "vllm-moe-offload-ascend", compatibility: "Qwen3.8-27B：不适用；Qwen3-30B-A3B TP4 graph：功能已验证、性能明显退化", requirements: "已验证 expert mapping、主机/设备换入换出、graph 地址稳定、并发、取消与异常恢复；不构成加速或生产推荐。" },
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
