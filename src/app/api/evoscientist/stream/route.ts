import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { recordApiRequest } from "@/lib/metrics";
import { createEvoScientistStreamResponse } from "@/lib/server/evoscientist/streaming";

export const runtime = "nodejs";

type EvoStreamRequest = {
  prompt?: string;
  model?: string;
  webSearch?: boolean;
  threadId?: string;
  workspaceDir?: string;
  resume?: unknown;
};

export async function POST(req: NextRequest) {
  const startedAt = performance.now();
  try {
    const body = (await req.json()) as EvoStreamRequest;
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const model = typeof body.model === "string" ? body.model : undefined;
    const isResume = body.resume !== undefined;
    const existingThread = Boolean(body.threadId?.trim());
    const threadId = existingThread
      ? body.threadId!.trim()
      : randomUUID().replace(/-/g, "").slice(0, 8);

    if (!prompt && !isResume) {
      recordApiRequest("/api/evoscientist/stream", "POST", 400, (performance.now() - startedAt) / 1000);
      return Response.json({ error: "prompt 或 resume 至少需要一个" }, { status: 400 });
    }
    if (isResume && !existingThread) {
      recordApiRequest("/api/evoscientist/stream", "POST", 400, (performance.now() - startedAt) / 1000);
      return Response.json({ error: "resume 模式必须提供 threadId" }, { status: 400 });
    }

    return createEvoScientistStreamResponse({
      prompt,
      model,
      webSearch: body.webSearch !== false,
      threadId,
      existingThread,
      requestedWorkspaceDir:
        typeof body.workspaceDir === "string" && body.workspaceDir.trim()
          ? body.workspaceDir.trim()
          : undefined,
      resume: body.resume,
      requestSignal: req.signal,
      onFinalize(statusCode, durationSeconds) {
        recordApiRequest("/api/evoscientist/stream", "POST", statusCode, durationSeconds);
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
