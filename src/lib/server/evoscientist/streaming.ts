import {
  cleanEvoScientistOutput,
  resolveEvoScientistTimeoutMs,
  summarizeEvoScientistFailure,
} from "../evoscientist";
import {
  prepareEvoScientistExecution,
  type PreparedEvoScientistExecution,
} from "./execution";
import { spawnManagedProcess, type ManagedProcess } from "./lifecycle";

function encodeSseEvent(payload: unknown, encoder: TextEncoder): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

export function createEvoScientistStreamResponse(options: {
  prompt: string;
  model?: string;
  webSearch: boolean;
  threadId: string;
  existingThread: boolean;
  requestedWorkspaceDir?: string;
  resume?: unknown;
  requestSignal: AbortSignal;
  onFinalize: (statusCode: number, durationSeconds: number) => void;
}): Response {
  const startedAt = performance.now();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let execution: PreparedEvoScientistExecution | null = null;
  let managed: ManagedProcess | null = null;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  let timeout: NodeJS.Timeout | null = null;
  let finalized = false;
  let streamClosed = false;
  let cancelled = false;
  let timedOut = false;
  let stdoutBuffer = "";
  let stdoutRaw = "";
  let stderr = "";
  let sawErrorEvent = false;
  let sawInterruptEvent = false;

  const finalize = (statusCode: number) => {
    if (finalized) return;
    finalized = true;
    if (timeout) clearTimeout(timeout);
    options.requestSignal.removeEventListener("abort", abortHandler);
    execution?.dispose();
    options.onFinalize(statusCode, (performance.now() - startedAt) / 1000);
  };

  const send = (payload: unknown) => {
    if (streamClosed || !controllerRef) return;
    controllerRef.enqueue(encodeSseEvent(payload, encoder));
  };

  const close = (statusCode: number) => {
    if (streamClosed) return;
    streamClosed = true;
    finalize(statusCode);
    try {
      controllerRef?.close();
    } catch {
      // A consumer-side cancellation may already have closed the stream.
    }
  };

  const abortHandler = () => {
    cancelled = true;
    managed?.terminate();
    close(499);
  };

  const streamBody = new ReadableStream<Uint8Array>({
    async start(controller) {
      controllerRef = controller;
      options.requestSignal.addEventListener("abort", abortHandler, { once: true });
      send({ type: "run_preparing", threadId: options.threadId });

      try {
        execution = await prepareEvoScientistExecution({
          prompt: options.prompt,
          model: options.model,
          webSearch: options.webSearch,
          threadId: options.threadId,
          loadThreadMetadata: options.existingThread,
          requestedWorkspaceDir: options.requestedWorkspaceDir,
          resume: options.resume,
        });
      } catch (error) {
        if (cancelled) return;
        send({ type: "error", message: (error as Error)?.message || "preparation failed" });
        send({
          type: "run_finished",
          status: "failed",
          durationMs: Math.round(performance.now() - startedAt),
          exitCode: null,
          timedOut: false,
        });
        close(500);
        return;
      }

      if (cancelled) {
        execution.dispose();
        return;
      }

      managed = spawnManagedProcess({
        command: execution.command,
        cwd: execution.workdir,
        env: execution.env,
      });
      const { child } = managed;

      send({
        type: "run_started",
        threadId: options.threadId,
        workspaceDir: execution.workspaceDir,
        resumed: options.resume !== undefined,
        integration: execution.integration,
        execution: {
          model: execution.model,
          contextWindowTokens: execution.contextWindowTokens,
        },
        search: {
          enabled: execution.search.enabled,
          attempted: execution.search.attempted,
          mode: execution.search.mode,
          query: execution.search.query,
          results: execution.search.results,
        },
      });

      timeout = setTimeout(() => {
        timedOut = true;
        managed?.terminate();
      }, resolveEvoScientistTimeoutMs());
      timeout.unref();

      child.stdout.on("data", (chunk: Buffer) => {
        const decoded = decoder.decode(chunk, { stream: true });
        stdoutRaw += decoded;
        stdoutBuffer += decoded;
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const event = JSON.parse(trimmed) as { type?: string };
            if (event.type === "error") sawErrorEvent = true;
            if (event.type === "interrupt" || event.type === "ask_user") {
              sawInterruptEvent = true;
            }
            send(event);
          } catch {
            // The bridge contract is NDJSON; malformed diagnostics stay server-side.
          }
        }
      });

      child.stderr.on("data", (chunk: Buffer) => {
        if (stderr.length < 120000) stderr += chunk.toString("utf-8");
      });

      child.on("error", (error) => {
        send({ type: "error", message: error.message });
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
        if (stdoutBuffer.trim()) {
          try {
            const trailing = JSON.parse(stdoutBuffer.trim()) as { type?: string };
            if (trailing.type === "error") sawErrorEvent = true;
            if (trailing.type === "interrupt" || trailing.type === "ask_user") {
              sawInterruptEvent = true;
            }
            send(trailing);
          } catch {
            // Ignore a trailing non-contract line.
          }
        }

        const status = timedOut
          ? "failed"
          : code === 0
            ? sawInterruptEvent
              ? "interrupted"
              : "completed"
            : "failed";
        if (status === "failed" && !sawErrorEvent && !cancelled) {
          send({
            type: "error",
            message: summarizeEvoScientistFailure(
              `${stderr}\n${cleanEvoScientistOutput(stdoutRaw)}`
            ),
          });
        }
        if (!cancelled) {
          send({
            type: "run_finished",
            status,
            durationMs: Math.round(performance.now() - startedAt),
            exitCode: code,
            timedOut,
          });
        }
        close(status === "failed" ? 502 : cancelled ? 499 : 200);
      });
    },
    cancel() {
      cancelled = true;
      managed?.terminate();
      finalize(499);
    },
  });

  return new Response(streamBody, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
