import type { RuntimeProvenance } from "./runtimeProvenance";

export type ModCompatibilityStatus = "compatible" | "incompatible" | "unverified";

export interface ModCompatibilityAssessment {
  status: ModCompatibilityStatus;
  label: "兼容" | "不兼容" | "未核验";
  reason: string;
  evaluatedAgainst: { coreVersion?: string; pluginVersion?: string; coreSha?: string; pluginSha?: string };
}

export interface CurrentRuntimeCompatibility {
  status: "compatible" | "incompatible" | "unknown";
  label: "兼容" | "不兼容" | "未核验";
  reason: string;
  evaluatedAgainst: ModCompatibilityAssessment["evaluatedAgainst"];
}

export function currentCompatibility(
  assessment: ModCompatibilityAssessment,
): CurrentRuntimeCompatibility {
  return {
    ...assessment,
    status: assessment.status === "unverified" ? "unknown" : assessment.status,
  };
}

const TARGET_CORE_SHA = "762f85b311fbab0bcf8921dd216f5093cd58b9b8";
const TARGET_PLUGIN_SHA = "4e57439e58ed3d78e675f9fd7b4614fb183c5394";
const BIDKV_CURRENT_CORE_SHA = "a4d6aa022fb1885a25a802a6e29372c81eac6c9f";
const BIDKV_CURRENT_PLUGIN_SHA = "2c8c722107a54127999a64c4eb0ec86139df8c26";

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
 * This assesses whether the verified host artifact belongs to a functionally
 * qualified lane. Installation/configuration/enabled/effective state is
 * deliberately reported elsewhere and never changes this artifact verdict.
 */
export function assessModCompatibility(modId: string, runtime: RuntimeProvenance): ModCompatibilityAssessment {
  if (!runtime.available || runtime.verification?.status !== "verified" || !runtime.components) {
    return result("unverified", "当前容器身份或安装制品尚未核验，不能判断兼容性。", runtime);
  }

  const exactTarget = runtime.components.core.commit === TARGET_CORE_SHA &&
    runtime.components.plugin.commit === TARGET_PLUGIN_SHA;

  if (modId === "bidkv") {
    const exactCurrentMain = runtime.components.core.commit === BIDKV_CURRENT_CORE_SHA &&
      runtime.components.plugin.commit === BIDKV_CURRENT_PLUGIN_SHA;
    if (minor(runtime.components.core.version) !== "0.28" ||
        minor(runtime.components.plugin.version) !== "0.25" ||
        (!exactCurrentMain && !exactTarget)) {
      return result("unverified", "当前 Core/Ascend 制品不在 BidKV 已完成实机功能验收的精确 lane；没有反证证明不兼容。", runtime);
    }
    return result("compatible", "该宿主制品属于 Qwen3.8-27B BidKV TP4 graph 已通过功能验收的精确 lane；安装、配置、启用与运行生效状态另行报告。", runtime);
  }

  if (modId === "diffspec") {
    if (!exactTarget || minor(runtime.components.plugin.version) !== "0.25") {
      return result("unverified", "当前 Core/Ascend 制品不在 DiffSpec 已完成实机功能验收的精确 lane；没有反证证明不兼容。", runtime);
    }
    return result("compatible", "该宿主制品属于 DiffSpec 已通过功能验收的精确 lane；仍须由配置和 live witness 核对 Qwen3.8、draft 哈希及当前运行状态。", runtime);
  }

  if (modId === "latchmoe") {
    if (!exactTarget) {
      return result("unverified", "当前 Core/Ascend 制品不在 LatchMoE 已完成实机功能验收的精确 lane；没有反证证明不兼容。", runtime);
    }
    return result("unverified", "Qwen3.8-27B 是 dense 模型，LatchMoE 不适用；Qwen3-30B-A3B 候选已通过 TP4 graph 功能门禁但性能退化。当前容器未证明候选 63781f3d、模型身份和 runtime-effective 见证，不能继承该结论。", runtime);
  }

  return result("unverified", "该扩展由外部运维方管理，Workstation 没有其生命周期兼容性证据。", runtime);
}
