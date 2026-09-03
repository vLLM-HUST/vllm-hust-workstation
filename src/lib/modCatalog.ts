/** Reviewed snapshot of the official registry, not a remote executable feed. */
export const MOD_CATALOG_SOURCE = "https://vllm-hust.sage.org.ai/plugins.html";
export const MOD_MANAGER_SHA = "9fb467447e95d753f7002b28575d6802f4347181";
// `compatibility` records the pinned source's historical declaration, not a
// verdict about the selected instance. Requalify exact artifacts before updating
// that declaration; neither a version mismatch nor preparation proves runtime fit.
export const MOD_CATALOG = [
  { id: "bidkv", name: "BidKV", kind: "推理扩展", description: "KV 压力下的效用感知抢占策略。", repository: "https://github.com/vLLM-HUST/vllm-hust-bidkv", sha: "6007abbd667502367eabe981604c2e5216085202", bundle: "org.vllm-hust.bidkv", package: "bidkv", compatibility: "vLLM-HUST 0.23 · Ascend · scheduler-policy v1", requirements: "需要目标宿主提供 scheduler-policy 契约；不支持热卸载。" },
  { id: "diffspec", name: "DiffSpec", kind: "推理扩展", description: "面向长序列的差分推测解码。", repository: "https://github.com/vLLM-HUST/vllm-ascend-hust-diffspec", sha: "762959978514cdd01407b58f1015a75f2ae2c936", bundle: "org.vllm-hust.diffspec", package: "vllm-diffspec", compatibility: "vLLM Ascend 0.23 · 实验支持", requirements: "需要 draft model 配置；包含未版本化的进程内补丁面。" },
  { id: "latchmoe", name: "LatchMoE", kind: "推理扩展", description: "保持地址稳定、兼容计算图的 MoE 专家卸载。", repository: "https://github.com/vLLM-HUST/vllm-ascend-hust-LatchMoE", sha: "53675b58a93b8cc455dba6bb630bfd8bef55a134", bundle: "org.vllm-hust.latchmoe", package: "vllm-moe-offload-ascend", compatibility: "固定 vLLM 0.21 / HUST MoE seam · 实验支持", requirements: "单 NPU、max-num-seqs=1、关闭 prefix cache；仅适用已验证 MoE 模型。" },
  { id: "pegaflow", name: "PegaFlow", kind: "外部服务", description: "独立的 KV 存储、传输与元数据系统。", repository: "https://github.com/vLLM-HUST/pegaflow-hust", sha: "", bundle: "", package: "", compatibility: "由外部服务运维方管理", requirements: "Provider 只生成连接配置和健康检查；工作站不启停服务，不删除 KV 数据。" },
] as const;

export type ModId = typeof MOD_CATALOG[number]["id"];
export type ModAction = "install" | "configure" | "enable" | "disable" | "uninstall" | "run";
export interface ModState { installed: boolean; enabled: boolean; configured: boolean; version?: string; sha?: string; installedAt?: string }
export interface ModTask { id: string; modId: string; action: string; status: "queued" | "running" | "succeeded" | "failed" | "interrupted"; createdAt: string; updatedAt: string; logs: string[] }
export interface ModCatalogPayload {
  catalog: Array<typeof MOD_CATALOG[number] & { state: ModState; stateError?: string }>;
  administrator: boolean;
  storageReady: boolean;
  tasks: ModTask[];
  runtime: { status: "unverified"; message: string };
}
