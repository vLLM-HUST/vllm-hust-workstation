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

const LATCHMOE_CORE_SHA = "ad7125a431e176d4161099480a66f0169609a690";
const LATCHMOE_PLUGIN_SHA = "4806367eeeb7d62b32078ae90cd929cc06d825fe";

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

  if (modId === "bidkv") {
    const current = minor(runtime.components.core.version);
    if (current !== "0.23") {
      return result("incompatible", `固定 manifest 要求 vLLM-HUST >=0.23,<0.24；当前 Core 为 ${runtime.components.core.version}。`, runtime);
    }
    return result("unverified", "宿主版本在声明范围内，但 scheduler-policy v1、Manager admission 与执行证据尚未核验。", runtime);
  }

  if (modId === "diffspec") {
    const current = minor(runtime.components.plugin.version);
    if (current !== "0.23") {
      return result("incompatible", `固定 manifest 要求 vLLM Ascend >=0.23,<0.24；当前 Plugin 为 ${runtime.components.plugin.version}。`, runtime);
    }
    return result("unverified", "宿主版本在声明范围内，但未版本化进程内补丁面、Manager admission 与执行证据尚未核验。", runtime);
  }

  if (modId === "latchmoe") {
    const core = runtime.components.core.commit;
    const plugin = runtime.components.plugin.commit;
    if (core !== LATCHMOE_CORE_SHA || plugin !== LATCHMOE_PLUGIN_SHA) {
      return result("incompatible", `固定 compatibility.lock 要求 Core ${LATCHMOE_CORE_SHA.slice(0, 8)}、Ascend seam ${LATCHMOE_PLUGIN_SHA.slice(0, 8)}；当前为 ${core.slice(0, 8)} / ${plugin.slice(0, 8)}。`, runtime);
    }
    return result("unverified", "源码锁匹配，但 MoE 模型、资源、graph 配置和真实执行证据尚未核验。", runtime);
  }

  return result("unverified", "该扩展由外部运维方管理，Workstation 没有其生命周期兼容性证据。", runtime);
}
