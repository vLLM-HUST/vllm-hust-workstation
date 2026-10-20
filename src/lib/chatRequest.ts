/** One budget policy for both ordinary browser requests and explicit API calls. */
export const DEFAULT_OUTPUT_BUDGET = 32768;

export function resolveOutputBudget(body: Record<string, unknown>, configured = process.env.WORKSTATION_DEFAULT_MAX_TOKENS): number {
  const first = body.max_tokens;
  const second = body.max_output_tokens;
  if (first !== undefined && second !== undefined && first !== second) {
    throw new Error("max_tokens 与 max_output_tokens 不一致");
  }
  const explicit = first ?? second;
  const value = explicit === undefined ? Number(configured ?? DEFAULT_OUTPUT_BUDGET) : explicit;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(explicit === undefined ? "服务生成预算配置无效" : "生成预算必须为正整数");
  }
  return value;
}

export function buildResponsesRequest(body: Record<string, unknown>, messages: unknown[]) {
  if (typeof body.model !== "string" || !body.model.trim()) {
    throw new Error("尚未确认在线聊天模型，请等待模型列表加载后重试");
  }
  if (body.enable_thinking !== undefined && typeof body.enable_thinking !== "boolean") {
    throw new Error("enable_thinking 必须为布尔值");
  }
  const options = { ...body };
  for (const key of ["messages", "max_tokens", "web_search", "enable_thinking"]) delete options[key];
  return {
    ...options,
    model: body.model,
    input: messages,
    stream: body.stream !== false,
    max_output_tokens: resolveOutputBudget(body),
    chat_template_kwargs: {
      ...(typeof body.chat_template_kwargs === "object" && body.chat_template_kwargs !== null
        ? body.chat_template_kwargs : {}),
      enable_thinking: body.enable_thinking !== false,
    },
  };
}
