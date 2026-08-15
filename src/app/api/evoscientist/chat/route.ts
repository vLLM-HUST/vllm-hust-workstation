import { NextRequest } from "next/server";
import {
  cleanEvoScientistOutput,
  createEvoScientistConfigRoot,
  getEvoScientistApiKey,
  getEvoScientistIntegrationStatus,
  getEvoScientistBaseUrl,
  getEvoScientistSpawnEnv,
  removeEvoScientistConfigRoot,
  resolveEvoScientistCommand,
  resolveEvoScientistTimeoutMs,
  resolveEvoScientistWorkdir,
  resolveServedModelCapability,
  summarizeEvoScientistFailure,
} from "@/lib/server/evoscientist";
import { spawnManagedProcess } from "@/lib/server/evoscientist/lifecycle";
import { getWebSearchContext } from "@/lib/server/webSearch";
import { recordApiRequest } from "@/lib/metrics";

export const runtime = "nodejs";

type EvoChatRequest = {
  prompt?: string;
  model?: string;
  webSearch?: boolean;
};

function extractAssistantReply(raw: string): string {
  const text = cleanEvoScientistOutput(raw);
  if (!text) {
    return "";
  }

  const workspaceMarker = text.match(/Workspace:[^\n]*\n+([\s\S]*)$/);
  if (workspaceMarker?.[1]?.trim()) {
    return workspaceMarker[1].trim();
  }

  return text
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return false;
      }
      return !(
        trimmed === "Loading agent..." ||
        trimmed.startsWith("⚠") ||
        trimmed.startsWith("Thread:") ||
        trimmed.startsWith("Workspace:") ||
        trimmed.startsWith("> ") ||
        /^─+$/.test(trimmed)
      );
    })
    .join("\n")
    .trim();
}

async function runEvoScientist(prompt: string, model?: string, signal?: AbortSignal): Promise<{
  durationMs: number;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  command: string[];
}> {
  const workdir = resolveEvoScientistWorkdir();
  const timeoutMs = resolveEvoScientistTimeoutMs();
  const baseUrl = getEvoScientistBaseUrl();
  const apiKey = getEvoScientistApiKey();
  const capability = await resolveServedModelCapability(model);
  const configRoot = createEvoScientistConfigRoot({
    model: capability.id,
    baseUrl,
    apiKey,
    contextWindowTokens: capability.maxContextTokens,
  });

  const command = resolveEvoScientistCommand(prompt, workdir);

  const startedAt = Date.now();

  const cleanupConfigRoot = () => {
    removeEvoScientistConfigRoot(configRoot);
  };

  return await new Promise((resolve, reject) => {
    const { child, terminate } = spawnManagedProcess({
      command,
      cwd: workdir,
      env: getEvoScientistSpawnEnv({
        configRoot,
        apiKey,
        baseUrl,
        workdir,
        contextWindowTokens: capability.maxContextTokens ?? undefined,
      }),
    });
    const abortHandler = () => terminate();
    signal?.addEventListener("abort", abortHandler, { once: true });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const cap = 120000;

    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length < cap) {
        stdout += chunk.toString("utf-8");
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < cap) {
        stderr += chunk.toString("utf-8");
      }
    });

    child.on("error", (error) => {
      signal?.removeEventListener("abort", abortHandler);
      cleanupConfigRoot();
      reject(error);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abortHandler);
      const durationMs = Date.now() - startedAt;
      cleanupConfigRoot();
      if (timedOut) {
        resolve({
          durationMs,
          stdout,
          stderr: `${stderr}\nTimed out after ${timeoutMs}ms.`,
          exitCode: code,
          command,
        });
        return;
      }
      resolve({ durationMs, stdout, stderr, exitCode: code, command });
    });
  });
}

export async function POST(req: NextRequest) {
  const start = performance.now();

  try {
    const body = (await req.json()) as EvoChatRequest;
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const model = typeof body.model === "string" ? body.model : undefined;
    const webSearch = body.webSearch !== false;

    if (!prompt) {
      recordApiRequest("/api/evoscientist/chat", "POST", 400, (performance.now() - start) / 1000);
      return Response.json({ error: "prompt 不能为空" }, { status: 400 });
    }

    const searchContext = await getWebSearchContext(prompt, webSearch);
    const effectivePrompt = searchContext.context
      ? `${searchContext.context}\n研究任务：${prompt}`
      : prompt;
    const result = await runEvoScientist(effectivePrompt, model, req.signal);
    const stdout = cleanEvoScientistOutput(result.stdout);
    const stderr = cleanEvoScientistOutput(result.stderr);
    const integration = await getEvoScientistIntegrationStatus(model);

    if (result.exitCode !== 0) {
      recordApiRequest("/api/evoscientist/chat", "POST", 502, (performance.now() - start) / 1000);
      const detail = summarizeEvoScientistFailure(`${stderr}\n${stdout}`);
      return Response.json(
        {
          error: "EvoScientist 执行失败",
          detail,
          exitCode: result.exitCode,
          command: result.command,
          integration,
          search: {
            enabled: searchContext.enabled,
            attempted: searchContext.attempted,
            mode: searchContext.mode,
            query: searchContext.query,
            results: searchContext.results,
          },
        },
        { status: 502 }
      );
    }

    const reply = extractAssistantReply(stdout) || stdout || "EvoScientist 未返回可显示内容。";
    recordApiRequest("/api/evoscientist/chat", "POST", 200, (performance.now() - start) / 1000);
    return Response.json({
      reply,
      durationMs: result.durationMs,
      command: result.command,
      integration,
      search: {
        enabled: searchContext.enabled,
        attempted: searchContext.attempted,
        mode: searchContext.mode,
        query: searchContext.query,
        results: searchContext.results,
      },
    });
  } catch (error: unknown) {
    recordApiRequest("/api/evoscientist/chat", "POST", 500, (performance.now() - start) / 1000);
    return Response.json(
      {
        error: "EvoScientist 调用异常",
        detail: (error as Error)?.message || "unknown error",
      },
      { status: 500 }
    );
  }
}
