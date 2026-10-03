import { readFile } from "node:fs/promises";
import type {
  TrafficSeriesPoint,
  TrafficSnapshot,
  TrafficWindowSnapshot,
} from "@/types";

const DEFAULT_TRAFFIC_SNAPSHOT =
  "/home/shuhao/sage-codex-router/runtime/codex-router.json";

function nonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function parseWindow(value: unknown): TrafficWindowSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<TrafficWindowSnapshot>;
  if (
    !nonNegativeNumber(candidate.requests) ||
    !nonNegativeNumber(candidate.successes) ||
    !nonNegativeNumber(candidate.errors) ||
    !nonNegativeNumber(candidate.rateLimited) ||
    !nonNegativeNumber(candidate.p50LatencyMs) ||
    !nonNegativeNumber(candidate.p95LatencyMs)
  ) {
    return undefined;
  }
  return candidate as TrafficWindowSnapshot;
}

function parseSeriesPoint(value: unknown): TrafficSeriesPoint | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<TrafficSeriesPoint>;
  if (
    !nonNegativeNumber(candidate.time) ||
    !nonNegativeNumber(candidate.requests) ||
    !nonNegativeNumber(candidate.errors) ||
    !nonNegativeNumber(candidate.p50LatencyMs)
  ) {
    return undefined;
  }
  return candidate as TrafficSeriesPoint;
}

export function parseTrafficSnapshot(value: unknown): TrafficSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<TrafficSnapshot>;
  if (
    !nonNegativeNumber(candidate.generatedAt) ||
    !nonNegativeNumber(candidate.retentionDays) ||
    !nonNegativeNumber(candidate.activeRequests) ||
    !nonNegativeNumber(candidate.activeKeys) ||
    !nonNegativeNumber(candidate.configuredConcurrency) ||
    !nonNegativeNumber(candidate.engineMaxSequences) ||
    !nonNegativeNumber(candidate.totalRequests) ||
    !nonNegativeNumber(candidate.totalSuccesses) ||
    !candidate.windows ||
    !Array.isArray(candidate.series)
  ) {
    return undefined;
  }

  const windows = {
    "1m": parseWindow(candidate.windows["1m"]),
    "5m": parseWindow(candidate.windows["5m"]),
    "1h": parseWindow(candidate.windows["1h"]),
    "24h": parseWindow(candidate.windows["24h"]),
  };
  if (!windows["1m"] || !windows["5m"] || !windows["1h"] || !windows["24h"]) {
    return undefined;
  }

  const series = candidate.series.map(parseSeriesPoint);
  if (series.some((point) => point === undefined)) return undefined;

  return {
    generatedAt: candidate.generatedAt,
    retentionDays: candidate.retentionDays,
    activeRequests: candidate.activeRequests,
    activeKeys: candidate.activeKeys,
    configuredConcurrency: candidate.configuredConcurrency,
    engineMaxSequences: candidate.engineMaxSequences,
    totalRequests: candidate.totalRequests,
    totalSuccesses: candidate.totalSuccesses,
    windows: windows as TrafficSnapshot["windows"],
    series: series as TrafficSeriesPoint[],
  };
}

export async function readTrafficSnapshot(): Promise<TrafficSnapshot | undefined> {
  const path = process.env.QWEN38_TRAFFIC_SNAPSHOT || DEFAULT_TRAFFIC_SNAPSHOT;
  try {
    return parseTrafficSnapshot(JSON.parse(await readFile(path, "utf8")));
  } catch {
    return undefined;
  }
}
