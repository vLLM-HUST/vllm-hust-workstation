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
    return result("unverified", "Qwen3.8-27B TP4 graph 的候选制品已通过调用、指标、回滚和输出门禁；但当前容器只证明宿主基线，未证明安装的是候选 463f798b，也未提供本实例 runtime-effective 见证。", runtime);
  }

  if (modId === "diffspec") {
    if (!exactTarget || minor(runtime.components.plugin.version) !== "0.25") {
      return result("incompatible", "候选 manifest 仅面向 Core 762f85b3 与 Ascend 4e57439e / 0.25.1rc1；当前运行制品不匹配。", runtime);
    }
    return result("unverified", "Qwen3.8-27B 与指定 VirVen Eagle3 draft 的 TP4 graph 候选已通过正确性、四 rank、接受/拒绝、KV、并发、取消和恢复门禁，但性能退化。当前容器只证明宿主基线，未证明安装的是候选 c78f55c7、匹配 draft 哈希及 runtime-effective 见证。", runtime);
  }

  if (modId === "latchmoe") {
    if (!exactTarget) {
      return result("incompatible", "候选 compatibility.lock 仅面向 Core 762f85b3 与 Ascend 4e57439e 加 MoE seam v2；当前运行制品不匹配。", runtime);
    }
    return result("unverified", "Qwen3.8-27B 是 dense 模型，LatchMoE 不适用；Qwen3-30B-A3B 候选已通过 TP4 graph 功能门禁但性能退化。当前容器未证明候选 63781f3d、模型身份和 runtime-effective 见证，不能继承该结论。", runtime);
  }

  return result("unverified", "该扩展由外部运维方管理，Workstation 没有其生命周期兼容性证据。", runtime);
}
