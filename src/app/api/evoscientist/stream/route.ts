import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { join } from "node:path";
import {
  cleanEvoScientistOutput,
  createEvoScientistConfigRoot,
  getEvoScientistApiKey,
  getEvoScientistBaseUrl,
  getEvoScientistIntegrationStatus,
  getEvoScientistSpawnEnv,
  getEvoScientistThreadMetadata,
  removeEvoScientistConfigRoot,
  resolveEvoScientistBridgeCommand,
  resolveEvoScientistTimeoutMs,
  resolveEvoScientistWorkdir,
  resolveEvoScientistWorkspacePath,
  resolveServedModel,
  summarizeEvoScientistFailure,
} from "@/lib/server/evoscientist";
import { getWebSearchContext } from "@/lib/server/webSearch";
import { recordApiRequest } from "@/lib/metrics";

export const runtime = "nodejs";

type EvoStreamRequest = {
  prompt?: string;
  model?: string;
  webSearch?: boolean;
  threadId?: string;
  workspaceDir?: string;
  resume?: unknown;
};

function encodeSseEvent(payload: unknown, encoder: TextEncoder): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

export async function POST(req: NextRequest) {
  const startedAt = performance.now();

  try {
    const body = (await req.json()) as EvoStreamRequest;
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const model = typeof body.model === "string" ? body.model : undefined;
    const webSearch = body.webSearch !== false;
    const isResume = body.resume !== undefined;
    const threadId = typeof body.threadId === "string" && body.threadId.trim()
      ? body.threadId.trim()
      : randomUUID().replace(/-/g, "").slice(0, 8);

    if (!prompt && !isResume) {
      recordApiRequest("/api/evoscientist/stream", "POST", 400, (performance.now() - startedAt) / 1000);
      return Response.json({ error: "prompt 或 resume 至少需要一个" }, { status: 400 });
    }

    if (isResume && (!body.threadId || !body.threadId.trim())) {
      recordApiRequest("/api/evoscientist/stream", "POST", 400, (performance.now() - startedAt) / 1000);
      return Response.json({ error: "resume 模式必须提供 threadId" }, { status: 400 });
    }

    const threadMetadata = body.threadId?.trim()
      ? await getEvoScientistThreadMetadata(body.threadId.trim()).catch(() => null)
      : null;
    const searchContext = !isResume
      ? await getWebSearchContext(prompt, webSearch)
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
      : searchContext.context
        ? `${searchContext.context}\n研究任务：${prompt}`
        : prompt;
    const workdir = resolveEvoScientistWorkdir();
    const workspaceDir = resolveEvoScientistWorkspacePath(
      typeof body.workspaceDir === "string" && body.workspaceDir.trim()
        ? body.workspaceDir
        : threadMetadata?.workspaceDir || null
    );
    const resolvedModel = await resolveServedModel(model || threadMetadata?.model || undefined);
    const integration = await getEvoScientistIntegrationStatus(model);
    const configRoot = createEvoScientistConfigRoot({
      model: resolvedModel,
      baseUrl: getEvoScientistBaseUrl(),
      apiKey: getEvoScientistApiKey(),
    });

    let command: string[];
    try {
      command = resolveEvoScientistBridgeCommand({
        scriptPath: join(process.cwd(), "scripts", "evoscientist_stream.py"),
        prompt: effectivePrompt,
        resumePayload: body.resume,
        threadId,
        workspaceDir,
        model: resolvedModel,
      });
    } catch (error) {
      removeEvoScientistConfigRoot(configRoot);
      throw error;
    }

    const child = spawn(command[0], command.slice(1), {
      cwd: workdir,
      env: getEvoScientistSpawnEnv({
        configRoot,
        apiKey: getEvoScientistApiKey(),
        baseUrl: getEvoScientistBaseUrl(),
        workdir,
      }),
      stdio: ["ignore", "pipe", "pipe"],
    });

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const timeoutMs = resolveEvoScientistTimeoutMs();
    let stdoutBuffer = "";
    let stdoutRaw = "";
    let stderr = "";
    let timedOut = false;
    let finalized = false;
    let streamClosed = false;
    let sawErrorEvent = false;
    let sawInterruptEvent = false;

    const finalize = (statusCode: number) => {
      if (finalized) {
        return;
      }
      finalized = true;
      removeEvoScientistConfigRoot(configRoot);
      recordApiRequest(
        "/api/evoscientist/stream",
        "POST",
        statusCode,
        (performance.now() - startedAt) / 1000
      );
    };

    const streamBody = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (payload: unknown) => {
          if (streamClosed) {
            return;
          }
          controller.enqueue(encodeSseEvent(payload, encoder));
        };

        const close = (statusCode: number) => {
          if (streamClosed) {
            return;
          }
          streamClosed = true;
          finalize(statusCode);
          controller.close();
        };

        send({
          type: "run_started",
          threadId,
          workspaceDir,
          resumed: isResume,
          integration,
          search: {
            enabled: searchContext.enabled,
            attempted: searchContext.attempted,
            mode: searchContext.mode,
            query: searchContext.query,
            results: searchContext.results,
          },
        });

        const timer = setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
          setTimeout(() => child.kill("SIGKILL"), 2500);
        }, timeoutMs);

        child.stdout.on("data", (chunk: Buffer) => {
          const decoded = decoder.decode(chunk, { stream: true });
          stdoutRaw += decoded;
          stdoutBuffer += decoded;
          const lines = stdoutBuffer.split("\n");
          stdoutBuffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
              continue;
            }

            try {
              const event = JSON.parse(trimmed) as { type?: string };
              if (event.type === "error") {
                sawErrorEvent = true;
              }
              if (event.type === "interrupt" || event.type === "ask_user") {
                sawInterruptEvent = true;
              }
              send(event);
            } catch {
              // Ignore malformed bridge output.
            }
          }
        });

        child.stderr.on("data", (chunk: Buffer) => {
          if (stderr.length < 120000) {
            stderr += chunk.toString("utf-8");
          }
        });

        child.on("error", (error) => {
          send({
            type: "error",
            message: error.message,
          });
          send({
            type: "run_finished",
            status: "failed",
            durationMs: Math.round(performance.now() - startedAt),
            exitCode: null,
            timedOut: false,
          });
          close(500);
        });

        child.on("close", (code) => {
          clearTimeout(timer);
          if (stdoutBuffer.trim()) {
            try {
              const trailing = JSON.parse(stdoutBuffer.trim()) as { type?: string };
              if (trailing.type === "error") {
                sawErrorEvent = true;
              }
              if (trailing.type === "interrupt" || trailing.type === "ask_user") {
                sawInterruptEvent = true;
              }
              send(trailing);
            } catch {
              // Ignore trailing non-JSON output.
            }
          }

          const status = timedOut
            ? "failed"
            : code === 0
              ? sawInterruptEvent
                ? "interrupted"
                : "completed"
              : "failed";
          if (status === "failed" && !sawErrorEvent) {
            send({
              type: "error",
              message: summarizeEvoScientistFailure(`${stderr}\n${cleanEvoScientistOutput(stdoutRaw)}`),
            });
          }

          send({
            type: "run_finished",
            status,
            durationMs: Math.round(performance.now() - startedAt),
            exitCode: code,
            timedOut,
          });
          close(status === "failed" ? 502 : 200);
        });
      },
      cancel() {
        child.kill("SIGTERM");
        finalize(499);
      },
    });

    return new Response(streamBody, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error: unknown) {
    recordApiRequest("/api/evoscientist/stream", "POST", 500, (performance.now() - startedAt) / 1000);
    return Response.json(
      {
        error: "EvoScientist 流式调用异常",
        detail: (error as Error)?.message || "unknown error",
      },
      { status: 500 }
    );
  }
}