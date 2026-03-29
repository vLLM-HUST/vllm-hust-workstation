import {
  getEvoScientistSessionSummaries,
  getEvoScientistWorkspaceOptions,
  resolveEvoScientistWorkspacePath,
} from "@/lib/server/evoscientist";

export const runtime = "nodejs";

export async function GET() {
  const workspaces = getEvoScientistWorkspaceOptions();
  const sessions = await getEvoScientistSessionSummaries(40);

  return Response.json({
    selectedWorkspacePath: resolveEvoScientistWorkspacePath(),
    workspaces,
    sessions,
  });
}