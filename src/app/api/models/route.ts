import { DEFAULT_MODEL_ID, SERVER_CONFIG } from "@/lib/config";
import { recordApiRequest, recordUpstreamRequest } from "@/lib/metrics";
import { fetchUpstreamEngineProbe, fetchUpstreamModels } from "@/lib/upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const start = performance.now();
  const [modelsProbe, engineProbe] = await Promise.all([
    fetchUpstreamModels(),
    fetchUpstreamEngineProbe(),
  ]);

  recordUpstreamRequest(
    "/api/models",
    "/v1/models",
    modelsProbe.status ?? 0,
    modelsProbe.durationSeconds
  );
  if (engineProbe.status !== null) {
    recordUpstreamRequest(
      "/api/models",
      "/v1/management/engines",
      engineProbe.status,
      engineProbe.durationSeconds
    );
  }

  const fallbackModelId = process.env.DEFAULT_MODEL || DEFAULT_MODEL_ID;
  const usableIds = engineProbe.state === "healthy" ? engineProbe.modelIds : modelsProbe.ids;
  const availableIds = usableIds.length > 0 ? usableIds : [fallbackModelId];
  const liveModelSwitchSupported = usableIds.length > 1;

  recordApiRequest("/api/models", "GET", 200, (performance.now() - start) / 1000);
  return Response.json(
    {
      object: "list",
      data: availableIds.map((id) => ({ id, object: "model" })),
      upstreamAvailable: modelsProbe.reachable,
      liveModelSwitchSupported,
      engineReady:
        engineProbe.state === "healthy"
          ? true
          : engineProbe.state === "unhealthy"
            ? false
            : modelsProbe.reachable
              ? modelsProbe.ids.length > 0
              : false,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
