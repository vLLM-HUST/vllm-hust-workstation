export type ResponsesTextFields = {
  content: string;
  reasoning: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function textFromParts(value: unknown, acceptedTypes: Set<string>): string {
  if (!Array.isArray(value)) return "";
  return value
    .filter(isRecord)
    .filter((part) => acceptedTypes.has(typeof part.type === "string" ? part.type : ""))
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("");
}

/** Extract displayable text from a completed Responses API payload. */
export function extractResponsesText(payload: unknown): ResponsesTextFields {
  if (!isRecord(payload)) return { content: "", reasoning: "" };

  const outputText = typeof payload.output_text === "string" ? payload.output_text : "";
  let content = "";
  let reasoning = "";
  if (!Array.isArray(payload.output)) return { content: outputText, reasoning };

  for (const item of payload.output) {
    if (!isRecord(item)) continue;
    if (item.type === "message") {
      content += textFromParts(item.content, new Set(["output_text", "text"]));
    } else if (item.type === "reasoning") {
      reasoning += textFromParts(item.content, new Set(["reasoning_text", "text"]));
      reasoning += textFromParts(item.summary, new Set(["summary_text", "text"]));
    }
  }

  return { content: outputText || content, reasoning };
}

export type ResponsesTerminal = { finishReason: string; status: string; reason?: string; usage?: unknown };

export function responsesTerminal(payload: unknown, event = false): ResponsesTerminal | null {
  if (!isRecord(payload)) return null;
  const type = payload.type;
  if (event && !["response.completed", "response.incomplete", "response.failed", "response.cancelled", "error"].includes(String(type))) return null;
  const response = event && isRecord(payload.response) ? payload.response : payload;
  const details = isRecord(response.incomplete_details) ? response.incomplete_details : {};
  const status = typeof response.status === "string" ? response.status :
    type === "response.completed" ? "completed" : type === "response.incomplete" ? "incomplete" :
    type === "response.cancelled" ? "cancelled" : type === "response.failed" || type === "error" ? "failed" : "unknown";
  const reason = typeof details.reason === "string" ? details.reason : undefined;
  const finishReason = status === "completed" ? "stop" : reason === "max_output_tokens" ? "length" :
    reason === "content_filter" ? "content_filter" : status === "cancelled" ? "cancelled" :
    status === "failed" ? "error" : "incomplete";
  return { finishReason, status, reason, usage: response.usage };
}

export function chatUsage(usage: unknown): unknown {
  if (!isRecord(usage)) return undefined;
  return { prompt_tokens: usage.input_tokens, completion_tokens: usage.output_tokens,
    total_tokens: usage.total_tokens, completion_tokens_details: usage.output_tokens_details };
}

/** Convert a streaming Responses event to the text fields expected by the WS chat UI. */
export function extractResponsesStreamDelta(payload: unknown): ResponsesTextFields {
  if (!isRecord(payload) || typeof payload.delta !== "string") {
    return { content: "", reasoning: "" };
  }

  if (payload.type === "response.output_text.delta") {
    return { content: payload.delta, reasoning: "" };
  }
  if (
    payload.type === "response.reasoning_text.delta" ||
    payload.type === "response.reasoning_summary_text.delta"
  ) {
    return { content: "", reasoning: payload.delta };
  }
  return { content: "", reasoning: "" };
}

export function responseModel(payload: unknown): string {
  if (!isRecord(payload) || !isRecord(payload.response)) return "";
  return typeof payload.response.model === "string" ? payload.response.model : "";
}
