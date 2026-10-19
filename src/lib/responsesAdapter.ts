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

  let content = typeof payload.output_text === "string" ? payload.output_text : "";
  let reasoning = "";
  if (!Array.isArray(payload.output)) return { content, reasoning };

  for (const item of payload.output) {
    if (!isRecord(item)) continue;
    if (item.type === "message" && !content) {
      content += textFromParts(item.content, new Set(["output_text", "text"]));
    } else if (item.type === "reasoning") {
      reasoning += textFromParts(item.content, new Set(["reasoning_text", "text"]));
      reasoning += textFromParts(item.summary, new Set(["summary_text", "text"]));
    }
  }

  return { content, reasoning };
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
