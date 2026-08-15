export type ModelCapability = {
  id: string;
  maxContextTokens: number | null;
};

type ModelPayload = {
  id?: unknown;
  max_model_len?: unknown;
  max_context_length?: unknown;
  context_length?: unknown;
};

type ModelsResponse = {
  data?: ModelPayload[];
};

function positiveInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function aliases(modelId: string): string[] {
  const trimmed = modelId.trim();
  if (!trimmed) return [];
  const values = new Set([trimmed]);
  const tail = trimmed.split("/").pop();
  if (tail) values.add(tail);
  return [...values];
}

export function parseModelCapabilities(payload: ModelsResponse): ModelCapability[] {
  return (payload.data || []).flatMap((item) => {
    const id = typeof item.id === "string" ? item.id.trim() : "";
    if (!id) return [];
    return [{
      id,
      maxContextTokens:
        positiveInteger(item.max_model_len) ??
        positiveInteger(item.max_context_length) ??
        positiveInteger(item.context_length),
    }];
  });
}

export function selectModelCapability(
  requestedModels: string[],
  capabilities: ModelCapability[]
): ModelCapability | null {
  if (!capabilities.length) return null;

  for (const requested of requestedModels) {
    const requestedAliases = aliases(requested);
    const match = capabilities.find((capability) => {
      const servedAliases = aliases(capability.id);
      return requestedAliases.some((alias) => servedAliases.includes(alias));
    });
    if (match) return match;
  }

  return capabilities[0];
}

export async function fetchModelCapabilities(options: {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
}): Promise<ModelCapability[]> {
  const response = await fetch(`${options.baseUrl.replace(/\/+$/, "")}/v1/models`, {
    headers: { Authorization: `Bearer ${options.apiKey}` },
    signal: AbortSignal.timeout(options.timeoutMs ?? 3000),
  });
  if (!response.ok) {
    throw new Error(`models probe failed: ${response.status}`);
  }
  return parseModelCapabilities((await response.json()) as ModelsResponse);
}
