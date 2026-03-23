import { SERVER_CONFIG } from "@/lib/config";
import type { MetricsSnapshot } from "@/types";

export type UpstreamProbeResult = {
  reachable: boolean;
  status: number | null;
  durationSeconds: number;
};

export type UpstreamModelsProbe = UpstreamProbeResult & {
  ids: string[];
};

export type UpstreamEngineProbeState = "healthy" | "unhealthy" | "unsupported" | "unreachable";

export type UpstreamEngineProbe = UpstreamProbeResult & {
  state: UpstreamEngineProbeState;
  modelIds: string[];
};

export type UpstreamMetricsProbe = UpstreamProbeResult & {
  snapshot: Partial<MetricsSnapshot>;
};

function compactMetrics<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== null)
  ) as Partial<T>;
}

function parseFirstMetric(text: string, metricNames: string[]): number | undefined {
  for (const name of metricNames) {
    const match = text.match(new RegExp(`^${name}(?:\\{[^}]*\\})?\\s+([-+]?\\d*\\.?\\d+(?:[eE][-+]?\\d+)?)$`, "m"));
    if (match) {
      return Number.parseFloat(match[1]);
    }
  }
  return undefined;
}

function sumMetric(text: string, metricNames: string[]): number | undefined {
  for (const name of metricNames) {
    const matches = [...text.matchAll(new RegExp(`^${name}(?:\\{[^}]*\\})?\\s+([-+]?\\d*\\.?\\d+(?:[eE][-+]?\\d+)?)$`, "gm"))];
    if (matches.length > 0) {
      return matches.reduce((total, match) => total + Number.parseFloat(match[1]), 0);
    }
  }
  return undefined;
}

function parseMetricLabelValue(text: string, metricNames: string[], labelName: string): string | undefined {
  for (const name of metricNames) {
    const match = text.match(
      new RegExp(`^${name}\\{[^}]*${labelName}="([^"]+)"[^}]*\\}\\s+[-+]?\\d*\\.?\\d+(?:[eE][-+]?\\d+)?$`, "m")
    );
    if (match) {
      return match[1];
    }
  }
  return undefined;
}

export async function fetchUpstreamModels(timeoutMs = 3000): Promise<UpstreamModelsProbe> {
  const start = performance.now();

  try {
    const res = await fetch(`${SERVER_CONFIG.baseUrl}/v1/models`, {
      headers: { Authorization: `Bearer ${SERVER_CONFIG.apiKey}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const durationSeconds = (performance.now() - start) / 1000;
    if (!res.ok) {
      return { reachable: false, ids: [], status: res.status, durationSeconds };
    }

    const data = await res.json();
    const ids = Array.isArray(data?.data)
      ? data.data.map((item: { id?: string }) => item.id).filter((id: string | undefined): id is string => Boolean(id))
      : [];

    return {
      reachable: true,
      ids: Array.from(new Set(ids)),
      status: res.status,
      durationSeconds,
    };
  } catch {
    return {
      reachable: false,
      ids: [],
      status: null,
      durationSeconds: (performance.now() - start) / 1000,
    };
  }
}

export async function fetchUpstreamEngineProbe(timeoutMs = 2000): Promise<UpstreamEngineProbe> {
  const start = performance.now();

  try {
    const res = await fetch(`${SERVER_CONFIG.baseUrl}/v1/management/engines`, {
      headers: { Authorization: `Bearer ${SERVER_CONFIG.apiKey}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const durationSeconds = (performance.now() - start) / 1000;

    if (!res.ok) {
      const detail = await res.text();
      if (res.status === 404 || res.status === 405 || detail.includes("Not Found")) {
        return { reachable: false, state: "unsupported", modelIds: [], status: res.status, durationSeconds };
      }
      if (detail.includes("Control Plane not initialized")) {
        return { reachable: true, state: "unhealthy", modelIds: [], status: res.status, durationSeconds };
      }
      return { reachable: false, state: "unreachable", modelIds: [], status: res.status, durationSeconds };
    }

    const data = await res.json();
    const modelIds = Array.isArray(data?.engines)
      ? data.engines
          .filter((engine: { is_healthy?: boolean; engine_kind?: string; model_id?: string }) => {
            return engine?.is_healthy && (engine?.engine_kind ?? "llm") === "llm" && engine?.model_id;
          })
          .map((engine: { model_id: string }) => engine.model_id)
      : [];

    return {
      reachable: true,
      state: modelIds.length > 0 ? "healthy" : "unhealthy",
      modelIds: Array.from(new Set(modelIds)),
      status: res.status,
      durationSeconds,
    };
  } catch {
    return {
      reachable: false,
      state: "unreachable",
      modelIds: [],
      status: null,
      durationSeconds: (performance.now() - start) / 1000,
    };
  }
}

export async function fetchUpstreamMetrics(timeoutMs = 2000): Promise<UpstreamMetricsProbe> {
  const start = performance.now();

  try {
    const res = await fetch(`${SERVER_CONFIG.baseUrl}/metrics`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    const durationSeconds = (performance.now() - start) / 1000;
    if (!res.ok) {
      return { reachable: false, snapshot: {}, status: res.status, durationSeconds };
    }

    const text = await res.text();
    const pendingRunning = sumMetric(text, ["vllm_hust_pending_requests", "vllm:num_requests_running"]);
    const pendingWaiting = sumMetric(text, ["vllm:num_requests_waiting"]);

    return {
      reachable: true,
      status: res.status,
      durationSeconds,
      snapshot: compactMetrics({
        tokensPerSecond: parseFirstMetric(text, [
          "vllm_hust_tokens_per_second",
          "vllm:avg_generation_throughput_toks_per_s",
        ]),
        pendingRequests:
          pendingRunning !== undefined || pendingWaiting !== undefined
            ? (pendingRunning ?? 0) + (pendingWaiting ?? 0)
            : undefined,
        gpuUtilPct: parseFirstMetric(text, ["vllm_hust_gpu_util_pct"]),
        gpuMemUsedGb:
          parseFirstMetric(text, ["vllm_hust_gpu_mem_used_bytes"]) !== undefined
            ? parseFirstMetric(text, ["vllm_hust_gpu_mem_used_bytes"])! / 1e9
            : undefined,
        gpuMemTotalGb:
          parseFirstMetric(text, ["vllm_hust_gpu_mem_total_bytes"]) !== undefined
            ? parseFirstMetric(text, ["vllm_hust_gpu_mem_total_bytes"])! / 1e9
            : undefined,
        totalRequestsServed: sumMetric(text, ["vllm_hust_requests_total", "vllm:request_success_total"]),
        avgLatencyMs: parseFirstMetric(text, ["vllm_hust_latency_p50_ms"]),
        modelName: parseMetricLabelValue(
          text,
          ["vllm:request_success_total", "vllm:generation_tokens_total", "vllm:num_requests_running"],
          "model_name"
        ),
      }),
    };
  } catch {
    return {
      reachable: false,
      snapshot: {},
      status: null,
      durationSeconds: (performance.now() - start) / 1000,
    };
  }
}

export async function fetchUpstreamStats(timeoutMs = 2000): Promise<UpstreamMetricsProbe> {
  const start = performance.now();

  try {
    const res = await fetch(`${SERVER_CONFIG.baseUrl}/v1/stats`, {
      headers: { Authorization: `Bearer ${SERVER_CONFIG.apiKey}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const durationSeconds = (performance.now() - start) / 1000;
    if (!res.ok) {
      return { reachable: false, snapshot: {}, status: res.status, durationSeconds };
    }
    return {
      reachable: true,
      snapshot: compactMetrics(await res.json()),
      status: res.status,
      durationSeconds,
    };
  } catch {
    return {
      reachable: false,
      snapshot: {},
      status: null,
      durationSeconds: (performance.now() - start) / 1000,
    };
  }
}
