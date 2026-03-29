import {
  getEvoScientistAdminSnapshot,
  removeEvoScientistMcpServer,
  resolveEvoScientistWorkspacePath,
  resolveServedModel,
  setEvoScientistConfigValues,
  startEvoScientistChannelWorker,
  stopEvoScientistChannelWorker,
  uninstallEvoScientistSkill,
  updateEvoScientistChannelsConfig,
  upsertEvoScientistMcpServer,
  installEvoScientistSkill,
} from "@/lib/server/evoscientist";
import { recordApiRequest } from "@/lib/metrics";

export const runtime = "nodejs";
export const revalidate = 0;

type AdminAction =
  | "set-config-values"
  | "skills-install"
  | "skills-uninstall"
  | "mcp-upsert"
  | "mcp-remove"
  | "channels-update"
  | "channels-start"
  | "channels-stop";

export async function GET(request: Request) {
  const startedAt = performance.now();
  try {
    const requestUrl = new URL(request.url);
    const workspaceDir = resolveEvoScientistWorkspacePath(requestUrl.searchParams.get("workspaceDir"));
    const payload = await getEvoScientistAdminSnapshot(workspaceDir);
    recordApiRequest("/api/evoscientist/admin", "GET", 200, (performance.now() - startedAt) / 1000);
    return Response.json(payload);
  } catch (error) {
    recordApiRequest("/api/evoscientist/admin", "GET", 500, (performance.now() - startedAt) / 1000);
    return Response.json(
      { error: (error as Error)?.message || "failed to load EvoScientist admin snapshot" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const startedAt = performance.now();

  try {
    const requestUrl = new URL(request.url);
    const body = (await request.json().catch(() => ({}))) as {
      action?: AdminAction;
      values?: Record<string, unknown>;
      source?: string;
      name?: string;
      mcp?: Record<string, unknown>;
      channels?: string[];
      sendThinking?: boolean;
      sharedWebhookPort?: number;
      workspaceDir?: string;
      model?: string;
    };
    const workspaceDir = resolveEvoScientistWorkspacePath(body.workspaceDir || requestUrl.searchParams.get("workspaceDir") || null);

    switch (body.action) {
      case "set-config-values":
        await setEvoScientistConfigValues(body.values || {}, workspaceDir);
        break;
      case "skills-install":
        if (!body.source?.trim()) {
          return Response.json({ error: "missing skill source" }, { status: 400 });
        }
        await installEvoScientistSkill(body.source.trim(), workspaceDir);
        break;
      case "skills-uninstall":
        if (!body.name?.trim()) {
          return Response.json({ error: "missing skill name" }, { status: 400 });
        }
        await uninstallEvoScientistSkill(body.name.trim(), workspaceDir);
        break;
      case "mcp-upsert":
        if (!body.mcp || typeof body.mcp !== "object") {
          return Response.json({ error: "missing MCP payload" }, { status: 400 });
        }
        await upsertEvoScientistMcpServer(body.mcp, workspaceDir);
        break;
      case "mcp-remove":
        if (!body.name?.trim()) {
          return Response.json({ error: "missing MCP server name" }, { status: 400 });
        }
        await removeEvoScientistMcpServer(body.name.trim(), workspaceDir);
        break;
      case "channels-update":
        await updateEvoScientistChannelsConfig({
          enabled: Array.isArray(body.channels) ? body.channels : [],
          sendThinking: body.sendThinking !== false,
          sharedWebhookPort: Number(body.sharedWebhookPort || 0),
        }, workspaceDir);
        break;
      case "channels-start": {
        const configuredChannels = Array.isArray(body.channels) ? body.channels.filter(Boolean) : [];
        await updateEvoScientistChannelsConfig({
          enabled: configuredChannels,
          sendThinking: body.sendThinking !== false,
          sharedWebhookPort: Number(body.sharedWebhookPort || 0),
        }, workspaceDir);
        const model = await resolveServedModel(body.model);
        await startEvoScientistChannelWorker({
          workspaceDir,
          model,
          configuredChannels,
        });
        break;
      }
      case "channels-stop":
        await stopEvoScientistChannelWorker();
        break;
      default:
        return Response.json({ error: "invalid action" }, { status: 400 });
    }

    const payload = await getEvoScientistAdminSnapshot(workspaceDir);
    recordApiRequest("/api/evoscientist/admin", "POST", 200, (performance.now() - startedAt) / 1000);
    return Response.json(payload);
  } catch (error) {
    recordApiRequest("/api/evoscientist/admin", "POST", 500, (performance.now() - startedAt) / 1000);
    return Response.json(
      { error: (error as Error)?.message || "failed to execute EvoScientist admin action" },
      { status: 500 }
    );
  }
}