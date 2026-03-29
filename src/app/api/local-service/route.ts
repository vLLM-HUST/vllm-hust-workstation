import path from "node:path";
import { spawn } from "node:child_process";
import { DEFAULT_MODEL_ID, SERVER_CONFIG } from "@/lib/config";
import { getEvoScientistIntegrationStatus } from "@/lib/server/evoscientist";
import { fetchUpstreamEngineProbe, fetchUpstreamModels } from "@/lib/upstream";
import type { LocalServiceStatus } from "@/types";

export const runtime = "nodejs";
export const revalidate = 0;

type LocalServiceAction = "ensure-backend" | "restart-backend" | "stop-local";

const QUICKSTART_PATH = path.join(process.cwd(), "quickstart.sh");
const LOCAL_HOSTNAMES = new Set(["127.0.0.1", "localhost", "0.0.0.0", "host.docker.internal"]);
const ENFORCE_BOOTSTRAP_MODEL = process.env.WORKSTATION_ENFORCE_BOOTSTRAP_MODEL_ON_START === "true";

function isLocalTarget(baseUrl: string): boolean {
  try {
    return LOCAL_HOSTNAMES.has(new URL(baseUrl).hostname);
  } catch {
    return false;
  }
}

async function getLocalServiceStatus(): Promise<LocalServiceStatus> {
  const [modelsProbe, engineProbe] = await Promise.all([
    fetchUpstreamModels(),
    fetchUpstreamEngineProbe(),
  ]);

  const desiredModel =
    process.env.WORKSTATION_BOOTSTRAP_MODEL ||
    process.env.DEFAULT_MODEL ||
    DEFAULT_MODEL_ID;
  const currentModel = engineProbe.modelIds[0] ?? modelsProbe.ids[0] ?? null;
  const localTarget = isLocalTarget(SERVER_CONFIG.baseUrl);
  const gatewayReachable = modelsProbe.reachable || engineProbe.status !== null;
  const inferenceReady =
    engineProbe.state === "healthy" ||
    modelsProbe.ids.length > 0;
  const modelMismatch = Boolean(currentModel && desiredModel && currentModel !== desiredModel);

  let recommendedAction: LocalServiceStatus["recommendedAction"] = "none";
  if (!localTarget) {
    recommendedAction = "external";
  } else if (!inferenceReady) {
    recommendedAction = gatewayReachable ? "restart" : "start";
  } else if (modelMismatch && ENFORCE_BOOTSTRAP_MODEL) {
    recommendedAction = "restart";
  }

  const evoScientist = await getEvoScientistIntegrationStatus(currentModel ?? desiredModel);

  return {
    baseUrl: SERVER_CONFIG.baseUrl,
    isLocalTarget: localTarget,
    gatewayReachable,
    inferenceReady,
    currentModel,
    desiredModel,
    recommendedAction,
    backendLogFile: path.join(process.cwd(), ".logs", "vllm-hust-serve.log"),
    frontendLogFile: path.join(process.cwd(), ".logs", "workstation-dev.log"),
    evoScientist,
  };
}

export async function GET() {
  return Response.json(await getLocalServiceStatus());
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as { action?: string };
  const action = payload.action as LocalServiceAction | undefined;

  if (!action || !["ensure-backend", "restart-backend", "stop-local"].includes(action)) {
    return Response.json({ error: "invalid action" }, { status: 400 });
  }

  if (!isLocalTarget(SERVER_CONFIG.baseUrl)) {
    return Response.json(
      { error: "current VLLM_HUST_BASE_URL points to a remote service; local control is disabled" },
      { status: 400 }
    );
  }

  const commandArg =
    action === "ensure-backend"
      ? "backend"
      : action === "restart-backend"
        ? "restart-backend"
        : "stop";

  const child = spawn("bash", [QUICKSTART_PATH, commandArg], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      WORKSTATION_INTERACTIVE_LAUNCHER: "false",
      WORKSTATION_INTERACTIVE_MODEL_MENU: "false",
    },
  });
  child.unref();

  return Response.json({
    ok: true,
    action,
    message:
      action === "stop-local"
        ? "已发起本地演示栈停止"
        : action === "restart-backend"
          ? "已发起本地后端重启"
          : "已发起本地后端拉起 / 修复",
  });
}