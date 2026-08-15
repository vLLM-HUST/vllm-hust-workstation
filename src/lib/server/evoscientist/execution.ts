import { join } from "node:path";
import {
  createEvoScientistConfigRoot,
  getEvoScientistApiKey,
  getEvoScientistBaseUrl,
  getEvoScientistIntegrationStatus,
  getEvoScientistSpawnEnv,
  getEvoScientistThreadMetadata,
  removeEvoScientistConfigRoot,
  resolveEvoScientistBridgeCommand,
  resolveEvoScientistWorkdir,
  resolveEvoScientistWorkspacePath,
  resolveServedModelCapability,
} from "../evoscientist";
import { getWebSearchContext } from "../webSearch";

export type PreparedEvoScientistExecution = {
  command: string[];
  env: NodeJS.ProcessEnv;
  workdir: string;
  workspaceDir: string;
  model: string;
  contextWindowTokens: number | null;
  integration: Awaited<ReturnType<typeof getEvoScientistIntegrationStatus>>;
  search: Awaited<ReturnType<typeof getWebSearchContext>>;
  dispose: () => void;
};

export async function prepareEvoScientistExecution(options: {
  prompt: string;
  model?: string;
  webSearch: boolean;
  threadId: string;
  loadThreadMetadata?: boolean;
  requestedWorkspaceDir?: string;
  resume?: unknown;
}): Promise<PreparedEvoScientistExecution> {
  const isResume = options.resume !== undefined;
  const threadMetadata = options.loadThreadMetadata
    ? await getEvoScientistThreadMetadata(options.threadId).catch(() => null)
    : null;
  const search = !isResume
    ? await getWebSearchContext(options.prompt, options.webSearch)
    : {
        enabled: false,
        attempted: false,
        mode: "disabled" as const,
        query: "",
        results: [],
        context: "",
      };
  const effectivePrompt = isResume
    ? ""
    : search.context
      ? `${search.context}\n研究任务：${options.prompt}`
      : options.prompt;
  const workdir = resolveEvoScientistWorkdir();
  const workspaceDir = resolveEvoScientistWorkspacePath(
    options.requestedWorkspaceDir || threadMetadata?.workspaceDir || null
  );
  const capability = await resolveServedModelCapability(
    options.model || threadMetadata?.model || undefined
  );
  const integration = await getEvoScientistIntegrationStatus(capability.id);
  const apiKey = getEvoScientistApiKey();
  const baseUrl = getEvoScientistBaseUrl();
  const configRoot = createEvoScientistConfigRoot({
    model: capability.id,
    baseUrl,
    apiKey,
    contextWindowTokens: capability.maxContextTokens,
  });

  try {
    const command = resolveEvoScientistBridgeCommand({
      scriptPath: join(process.cwd(), "scripts", "evoscientist_stream.py"),
      prompt: effectivePrompt,
      resumePayload: options.resume,
      threadId: options.threadId,
      workspaceDir,
      model: capability.id,
    });
    return {
      command,
      env: getEvoScientistSpawnEnv({
        configRoot,
        apiKey,
        baseUrl,
        workdir,
        contextWindowTokens: capability.maxContextTokens ?? undefined,
      }),
      workdir,
      workspaceDir,
      model: capability.id,
      contextWindowTokens: capability.maxContextTokens,
      integration,
      search,
      dispose: () => removeEvoScientistConfigRoot(configRoot),
    };
  } catch (error) {
    removeEvoScientistConfigRoot(configRoot);
    throw error;
  }
}
