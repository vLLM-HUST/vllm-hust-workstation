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
  const merged = { ...compactMetrics(internal), ...live, ...stats };
  // Configured defaults and historical metric labels are not current model
  // identity. Use the same healthy-engine preference as /api/models, and never
  // present a stale label when live discovery cannot verify a model.
  const observedModelIds = engineProbe.state === "healthy"
    ? engineProbe.modelIds
    : engineProbe.state !== "unhealthy" && modelsProbe.reachable ? modelsProbe.ids : [];
  const modelName = observedModelIds.length ? [...new Set(observedModelIds)].join(" · ") : "未核验";
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
    modelName,
    backendType: merged.backendType ?? (process.env.BACKEND_TYPE || "CPU"),
    gatewayAvailable,
  };
  setWorkstationInfo(snapshot.modelName!, snapshot.backendType!);

  recordApiRequest("/api/metrics", "GET", 200, (performance.now() - start) / 1000);
  return Response.json(snapshot, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
