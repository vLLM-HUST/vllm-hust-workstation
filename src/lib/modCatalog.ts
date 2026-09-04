/** Reviewed snapshot of the official registry, not a remote executable feed. */
export const MOD_CATALOG_SOURCE = "https://vllm-hust.sage.org.ai/plugins.html";
export const MOD_MANAGER_SHA = "9fb467447e95d753f7002b28575d6802f4347181";
export const MOD_MANAGER_CANDIDATE_SHA = "a8586ab17adab3b76e53b4abaf668564275e0fcb";
// `compatibility` records the pinned source's historical declaration, not a
// verdict about the selected instance. Requalify exact artifacts before updating
// that declaration; neither a version mismatch nor preparation proves runtime fit.
export const MOD_CATALOG = [
  { id: "bidkv", name: "BidKV", kind: "推理扩展", description: "KV 压力下的效用感知抢占策略。", repository: "https://github.com/vLLM-HUST/vllm-hust-bidkv", sha: "6007abbd667502367eabe981604c2e5216085202", candidateSha: "9fc611b19ee7a1bb22c3304843ddc5aa0d587dc7", candidateManagerSha: MOD_MANAGER_CANDIDATE_SHA, candidateStatus: "pending-review-and-tp4-qualification", bundle: "org.vllm-hust.bidkv", package: "bidkv", compatibility: "候选：Core 762f85b3 · Ascend 4e57439e · TP4 graph · 未核验", requirements: "旧 sha 仅为历史可复现制品；候选需独立 NPU 实跑且不得用 eager/TP1 降级。" },
  { id: "diffspec", name: "DiffSpec", kind: "推理扩展", description: "面向长序列的差分推测解码。", repository: "https://github.com/vLLM-HUST/vllm-ascend-hust-diffspec", sha: "762959978514cdd01407b58f1015a75f2ae2c936", candidateSha: "af00892c8858f28f672e5812f32ed70eaaaafe27", candidateManagerSha: MOD_MANAGER_CANDIDATE_SHA, candidateStatus: "blocked-no-compatible-eagle3-draft", bundle: "org.vllm-hust.diffspec", package: "vllm-diffspec", compatibility: "候选：Core 762f85b3 · Ascend 4e57439e · TP4 graph · 未核验", requirements: "缺少与 Qwen3.8 vocab/架构匹配的 Eagle3 draft；旧 sha 不代表当前兼容。" },
  { id: "latchmoe", name: "LatchMoE", kind: "推理扩展", description: "保持地址稳定、兼容计算图的 MoE 专家卸载。", repository: "https://github.com/vLLM-HUST/vllm-ascend-hust-LatchMoE", sha: "53675b58a93b8cc455dba6bb630bfd8bef55a134", candidateSha: "39259709227ee962c3b838b60279dc7335224dee", candidateManagerSha: MOD_MANAGER_CANDIDATE_SHA, candidateStatus: "pending-review-and-separate-moe-qualification", bundle: "org.vllm-hust.latchmoe", package: "vllm-moe-offload-ascend", compatibility: "Qwen3.8-27B：不适用；Qwen3-30B-A3B TP4 graph 候选未核验", requirements: "需含 Ascend MoE seam v2 的 4e57439e 派生制品；不得把 dense Qwen3.8 标为兼容。" },
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
