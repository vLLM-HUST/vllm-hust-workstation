import type { RuntimeProvenance } from "./runtimeProvenance";

export type ModCompatibilityStatus = "compatible" | "incompatible" | "unverified";

export interface ModCompatibilityAssessment {
  status: ModCompatibilityStatus;
  label: "兼容" | "不兼容" | "未核验";
  reason: string;
  evaluatedAgainst: { coreVersion?: string; pluginVersion?: string; coreSha?: string; pluginSha?: string };
}

export interface CurrentModCompatibility {
  status: "compatible" | "incompatible" | "unknown";
  label: "兼容" | "不兼容" | "未核验";
  reason: string;
  evaluatedAgainst: ModCompatibilityAssessment["evaluatedAgainst"];
}

export function currentCompatibility(
  assessment: ModCompatibilityAssessment,
): CurrentModCompatibility {
  return {
    ...assessment,
    status: assessment.status === "unverified" ? "unknown" : assessment.status,
  };
}

const TARGET_CORE_SHA = "762f85b311fbab0bcf8921dd216f5093cd58b9b8";
const TARGET_PLUGIN_SHA = "4e57439e58ed3d78e675f9fd7b4614fb183c5394";

function minor(version?: string): string | null {
  const match = version?.match(/^v?(\d+)\.(\d+)(?:\.|rc|$)/);
  return match ? `${match[1]}.${match[2]}` : null;
}

function result(
  status: ModCompatibilityStatus,
  reason: string,
  runtime: RuntimeProvenance,
): ModCompatibilityAssessment {
  return {
    status,
    label: status === "compatible" ? "兼容" : status === "incompatible" ? "不兼容" : "未核验",
    reason,
    evaluatedAgainst: {
      coreVersion: runtime.components?.core.version,
      pluginVersion: runtime.components?.plugin.version,
      coreSha: runtime.components?.core.commit,
      pluginSha: runtime.components?.plugin.commit,
    },
  };
}

/**
 * Compare immutable catalog declarations with the verified current runtime.
 * A range match is deliberately only `unverified`: compatibility also requires
 * Manager/Provider admission and target execution evidence not present here.
 */
export function assessModCompatibility(modId: string, runtime: RuntimeProvenance): ModCompatibilityAssessment {
  if (!runtime.available || runtime.verification?.status !== "verified" || !runtime.components) {
    return result("unverified", "当前容器身份或安装制品尚未核验，不能判断兼容性。", runtime);
  }

  const exactTarget = runtime.components.core.commit === TARGET_CORE_SHA &&
    runtime.components.plugin.commit === TARGET_PLUGIN_SHA;

  if (modId === "bidkv") {
    if (!exactTarget || minor(runtime.components.core.version) !== "0.28") {
      return result("incompatible", "候选 manifest 仅面向 Core 762f85b3 / 0.28.1rc1.dev319 与 Ascend 4e57439e；当前运行制品不匹配。", runtime);
    }
    return result("unverified", "源码已迁移到 preemption-policy API v1；尚缺独立 NPU 上的 TP4 graph 调用日志、指标、回滚和输出正确性证据。", runtime);
  }

  if (modId === "diffspec") {
    if (!exactTarget || minor(runtime.components.plugin.version) !== "0.25") {
      return result("incompatible", "候选 manifest 仅面向 Core 762f85b3 与 Ascend 4e57439e / 0.25.1rc1；当前运行制品不匹配。", runtime);
    }
    return result("unverified", "TP4 graph 源码适配尚未取得兼容 Eagle3 draft checkpoint，以及多 rank 接受/拒绝、KV 元数据、并发与恢复实跑证据。", runtime);
  }

  if (modId === "latchmoe") {
    if (!exactTarget) {
      return result("incompatible", "候选 compatibility.lock 仅面向 Core 762f85b3 与 Ascend 4e57439e 加 MoE seam v2；当前运行制品不匹配。", runtime);
    }
    return result("unverified", "Qwen3.8-27B 是 dense 模型，LatchMoE 对该模型不适用；Qwen3-30B-A3B 的 TP4 graph、专家映射、换入换出和地址稳定性仍待独立 NPU 实跑。", runtime);
  }

  return result("unverified", "该扩展由外部运维方管理，Workstation 没有其生命周期兼容性证据。", runtime);
}
