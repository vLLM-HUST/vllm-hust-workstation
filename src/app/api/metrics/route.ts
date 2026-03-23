import { DEFAULT_MODEL_ID, SERVER_CONFIG } from "@/lib/config";
import {
  getInternalMetricsSnapshot,
  recordApiRequest,
  recordUpstreamRequest,
  setWorkstationInfo,
} from "@/lib/metrics";
import {
  fetchUpstreamEngineProbe,
  fetchUpstreamMetrics,
  fetchUpstreamModels,
  fetchUpstreamStats,
} from "@/lib/upstream";
import type { MetricsSnapshot } from "@/types";

export const runtime = "nodejs";
export const revalidate = 0;

function compactMetrics<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== null)
  ) as Partial<T>;
}

export async function GET() {
  const start = performance.now();
  const [metricsProbe, statsProbe, engineProbe, modelsProbe] = await Promise.all([
    fetchUpstreamMetrics(),
    fetchUpstreamStats(),
    fetchUpstreamEngineProbe(),
    fetchUpstreamModels(),
  ]);

  if (metricsProbe.status !== null) {
    recordUpstreamRequest("/api/metrics", "/metrics", metricsProbe.status, metricsProbe.durationSeconds);
  }
  if (statsProbe.status !== null) {
    recordUpstreamRequest("/api/metrics", "/v1/stats", statsProbe.status, statsProbe.durationSeconds);
  }
  if (engineProbe.status !== null) {
    recordUpstreamRequest(
      "/api/metrics",
      "/v1/management/engines",
      engineProbe.status,
      engineProbe.durationSeconds
    );
  }
  if (modelsProbe.status !== null) {
    recordUpstreamRequest("/api/metrics", "/v1/models", modelsProbe.status, modelsProbe.durationSeconds);
  }

  const internal = getInternalMetricsSnapshot();
  const live = metricsProbe.snapshot;
  const stats = statsProbe.snapshot;
  setWorkstationInfo(
    internal.modelName || process.env.DEFAULT_MODEL || DEFAULT_MODEL_ID,
    internal.backendType || process.env.BACKEND_TYPE || "CPU"
  );

  const merged = { ...compactMetrics(internal), ...live, ...stats };
  const gatewayAvailable =
    engineProbe.state === "healthy" ||
    modelsProbe.ids.length > 0 ||
    (modelsProbe.reachable && engineProbe.state !== "unhealthy");

  const snapshot: MetricsSnapshot = {
    tokensPerSecond: merged.tokensPerSecond ?? 0,
    pendingRequests: merged.pendingRequests ?? 0,
    gpuUtilPct: merged.gpuUtilPct ?? 0,
    gpuMemUsedGb: merged.gpuMemUsedGb ?? 0,
    gpuMemTotalGb: merged.gpuMemTotalGb ?? 0,
    uptimeSeconds: merged.uptimeSeconds ?? 0,
    totalRequestsServed: merged.totalRequestsServed ?? 0,
    avgLatencyMs: merged.avgLatencyMs ?? 0,
    modelName:
      merged.modelName ??
      modelsProbe.ids[0] ??
      engineProbe.modelIds[0] ??
      (process.env.DEFAULT_MODEL || DEFAULT_MODEL_ID),
    backendType: merged.backendType ?? (process.env.BACKEND_TYPE || "CPU"),
    gatewayAvailable,
  };

  recordApiRequest("/api/metrics", "GET", 200, (performance.now() - start) / 1000);
  return Response.json(snapshot);
}
