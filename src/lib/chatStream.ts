export const EMPTY_ASSISTANT_RESPONSE =
  "模型没有返回最终答案；思考内容已单独保留，本次生成未成功完成。";

export const STOPPED_ASSISTANT_RESPONSE = "已停止当前生成。";

export type ChatTextFields = {
  content: string;
  reasoning: string;
};

export type ChatCompletion = {
  status: "completed" | "truncated" | "empty" | "interrupted" | "failed" | "cancelled" | "filtered";
  message: string;
};

/** DONE is framing, not proof that an answer was completed. */
export function classifyCompletion(content: string, finishReason: string | null,
  done: boolean, cancelled = false, transportError = false): ChatCompletion {
  if (cancelled || finishReason === "cancelled") return { status: "cancelled", message: STOPPED_ASSISTANT_RESPONSE };
  if (transportError || finishReason === "error") return { status: "failed", message: "上游响应异常，生成未完成；已保留收到的内容。" };
  if (finishReason === "length") return { status: "truncated", message: "生成额度已耗尽，最终答案可能不完整；思考与正文共用生成预算。" };
  if (finishReason === "content_filter") return { status: "filtered", message: "上游内容过滤终止了生成，答案未完整返回。" };
  if (finishReason !== "stop" || !done) return { status: "interrupted", message: "未收到上游正常完成信号，生成未完成；已保留收到的内容。" };
  if (!content.trim()) return { status: "empty", message: EMPTY_ASSISTANT_RESPONSE };
  return { status: "completed", message: "" };
}

/** Incremental SSE frames, including CRLF, multiline data and an EOF tail. */
export class ChatSseDecoder {
  private buffer = "";
  push(text: string, eof = false): ChatSseEvent[] {
    this.buffer += text;
    const frames = this.buffer.split(/\r?\n\r?\n/);
    this.buffer = frames.pop() ?? "";
    if (eof && this.buffer.trim()) { frames.push(this.buffer); this.buffer = ""; }
    return frames.map(frame => {
      const data = frame.split(/\r?\n/).filter(line => line.startsWith("data:"))
        .map(line => line.slice(5).trimStart()).join("\n");
      return parseChatSseLine("data: " + data);
    });
  }
}

export type ChatSseEvent =
  | { kind: "ignore" }
  | { kind: "done" }
  | { kind: "payload"; payload: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Read the current vLLM reasoning field while retaining compatibility with
 * deployments that still emit the older `reasoning_content` spelling.
 */
export function extractChatTextFields(value: unknown): ChatTextFields {
  if (!isRecord(value)) {
    return { content: "", reasoning: "" };
  }

  const currentReasoning = stringField(value.reasoning);
  const legacyReasoning = stringField(value.reasoning_content);
  return {
    content: stringField(value.content),
    reasoning: currentReasoning || legacyReasoning,
  };
}

export function extractChatStreamDelta(payload: unknown): ChatTextFields {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return { content: "", reasoning: "" };
  }
  const firstChoice = payload.choices[0];
  if (!isRecord(firstChoice)) {
    return { content: "", reasoning: "" };
  }
  return extractChatTextFields(firstChoice.delta);
}

export function extractChatMessage(payload: unknown): ChatTextFields {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return { content: "", reasoning: "" };
  }
  const firstChoice = payload.choices[0];
  if (!isRecord(firstChoice)) {
    return { content: "", reasoning: "" };
  }
  return extractChatTextFields(firstChoice.message);
}

export function parseChatSseLine(line: string): ChatSseEvent {
  if (!line.startsWith("data:")) {
    return { kind: "ignore" };
  }

  const data = line.slice(5).trim();
  if (!data) {
    return { kind: "ignore" };
  }
  if (data === "[DONE]") {
    return { kind: "done" };
  }

  try {
    return { kind: "payload", payload: JSON.parse(data) };
  } catch {
    return { kind: "ignore" };
  }
}

export function parseThinkContent(raw: string): { think: string; main: string } {
  const open = raw.indexOf("<think>");
  if (open === -1) {
    return { think: "", main: raw };
  }
  const close = raw.indexOf("</think>", open);
  if (close === -1) {
    return { think: raw.slice(open + 7), main: raw.slice(0, open) };
  }
  return {
    think: raw.slice(open + 7, close),
    main: raw.slice(0, open) + raw.slice(close + 8),
  };
}

export class ChatStreamAccumulator {
  private finishReason: string | null = null;
  private done = false;
  outputTokens: number | undefined;
  private rawContent = "";
  private answerContent = "";
  private reasoningContent = "";
  private taggedThinking = "";

  push(payload: unknown): ChatTextFields {
    if (isRecord(payload)) {
      if (payload.error) this.finishReason = "error";
      const choice = Array.isArray(payload.choices) ? payload.choices[0] : undefined;
      if (isRecord(choice) && typeof choice.finish_reason === "string" && this.finishReason !== "error") {
        this.finishReason = choice.finish_reason;
      }
      if (isRecord(payload.usage) && typeof payload.usage.completion_tokens === "number") {
        this.outputTokens = payload.usage.completion_tokens;
      }
    }
    const delta = extractChatStreamDelta(payload);
    if (delta.reasoning) {
      this.reasoningContent += delta.reasoning;
    }
    if (delta.content) {
      this.rawContent += delta.content;
      const parsed = parseThinkContent(this.rawContent);
      this.answerContent = parsed.main.trimStart() || parsed.main;
      this.taggedThinking = parsed.think;
    }
    return delta;
  }

  get content(): string {
    return this.answerContent;
  }

  get reasoning(): string {
    return this.reasoningContent;
  }

  get thinking(): string {
    return this.taggedThinking || this.reasoningContent;
  }

  markDone(): void { this.done = true; }

  completion(cancelled = false, transportError = false): ChatCompletion {
    return classifyCompletion(this.content, this.finishReason, this.done, cancelled, transportError);
  }

  visibleContent(emptyFallback = EMPTY_ASSISTANT_RESPONSE): string {
    if (this.answerContent.trim()) {
      return this.answerContent;
    }
    return emptyFallback;
  }
}
