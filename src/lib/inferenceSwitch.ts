export type SwitchMetric = {
  label: string;
  unit: string;
  baseline: number;
  optimized: number;
  betterWhen: "higher" | "lower";
  decimals: number;
};

export type SwitchStrategy = {
  id: string;
  name: string;
  role: string;
  status: "enabled" | "conditional" | "held";
  reason: string;
  evidence: string;
};

export const SWITCH_EVIDENCE = Object.freeze({
  id: "qwen35-sweprefix-c16-betterscale-20260927",
  title: "Qwen3.5-35B-A3B · SWE Prefix · C16",
  hardware: "Ascend 910B2 ×2 · TP2",
  measuredSeconds: 900,
  sampledAt: "2026-09-27",
  sourceUrl: "https://vllm-hust.sage.org.ai/leaderboard-runs.html#frontier",
  baselineRunId: "e52aadd2f98746d2b7da71ccd235ebb9",
  optimizedRunId: "fa0e01a32eef456bab4bebe51e4aa7dd",
  metrics: [
    {
      label: "输出吞吐 / 芯片",
      unit: "token/s",
      baseline: 443.90777777777777 / 2,
      optimized: 885.9611111111111 / 2,
      betterWhen: "higher",
      decimals: 2,
    },
    {
      label: "P95 首字时延",
      unit: "ms",
      baseline: 2004.9147347948738,
      optimized: 588.6589169880608,
      betterWhen: "lower",
      decimals: 0,
    },
    {
      label: "TPOT",
      unit: "ms",
      baseline: 38.19517177127504,
      optimized: 17.941780835099376,
      betterWhen: "lower",
      decimals: 1,
    },
  ] satisfies SwitchMetric[],
  strategies: [
    {
      id: "betterscale",
      name: "BetterScale",
      role: "运行时与状态管理",
      status: "enabled",
      reason: "当前模型、硬件、负载与并发有完整实测对照。",
      evidence: "实测运行 fa0e01a3",
    },
    {
      id: "prefix-cache",
      name: "Prefix Cache",
      role: "会话内前缀复用",
      status: "enabled",
      reason: "SWE Prefix 工作负载具有稳定会话前缀，实测运行保持亲和路由。",
      evidence: "实测命中率 97.65%",
    },
    {
      id: "balanced-decode-attention",
      name: "Balanced Decode Attention",
      role: "解码注意力配额",
      status: "enabled",
      reason: "在 C16 组合中与 BetterScale 同时验证，作为整体配置启用。",
      evidence: "实测配置一致",
    },
    {
      id: "bidkv",
      name: "BidKV",
      role: "KV 压力下的抢占策略",
      status: "conditional",
      reason: "只在观测到 KV 压力且目标单元具有独立正向证据时启用。",
      evidence: "按单元独立验证",
    },
    {
      id: "prefix-router",
      name: "Prefix Router",
      role: "多副本前缀亲和路由",
      status: "held",
      reason: "当前为单服务单元，未满足多副本路由条件。",
      evidence: "条件不满足",
    },
  ] satisfies SwitchStrategy[],
});

export function improvement(metric: SwitchMetric): number {
  if (metric.betterWhen === "higher") return metric.optimized / metric.baseline;
  return 1 - metric.optimized / metric.baseline;
}

export function improvementLabel(metric: SwitchMetric): string {
  const value = improvement(metric);
  if (metric.betterWhen === "higher") return `${value.toFixed(2)}×`;
  return `-${(value * 100).toFixed(1)}%`;
}

export function enabledStrategies(autoEnabled: boolean): SwitchStrategy[] {
  if (!autoEnabled) return [];
  return SWITCH_EVIDENCE.strategies.filter(strategy => strategy.status === "enabled");
}
